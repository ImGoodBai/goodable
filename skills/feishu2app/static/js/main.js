// ============================================
// 视图切换功能
// ============================================

// 切换视图
function switchView(viewName) {
    // 隐藏所有视图
    document.querySelectorAll('.view-container').forEach(view => {
        view.style.display = 'none';
    });

    // 显示目标视图
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.style.display = 'block';
    }

    // 更新菜单激活状态
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });

    // 根据视图执行相应的初始化
    if (viewName === 'home') {
        loadSpaces();
    } else if (viewName === 'settings') {
        loadConfigStatus();
    }
}

// 初始化菜单点击事件
function initMenuEvents() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = item.dataset.view;
            switchView(viewName);
        });
    });
}

// ============================================
// 配置功能
// ============================================

// 加载配置状态
async function loadConfigStatus() {
    const statusDiv = document.getElementById('config-status');
    const authBtn = document.getElementById('start-auth-btn');
    const refreshTokenBtn = document.getElementById('refresh-token-btn');
    const appIdInput = document.getElementById('app-id');
    const appSecretInput = document.getElementById('app-secret');

    if (!statusDiv) return;

    statusDiv.innerHTML = '<p>正在检查配置状态...</p>';
    statusDiv.className = 'status-info';

    try {
        const response = await fetch('/api/config/status');
        const result = await response.json();

        if (result.configured) {
            // 回显 APP_ID 和 APP_SECRET 到输入框（placeholder 显示脱敏值）
            if (appIdInput && result.app_id) {
                appIdInput.value = '';
                appIdInput.placeholder = '当前: ' + result.app_id;
            }
            if (appSecretInput && result.app_secret) {
                appSecretInput.value = '';
                appSecretInput.placeholder = '当前: ' + result.app_secret;
            }

            if (result.has_token && result.token_valid) {
                // Token 有效
                statusDiv.className = 'status-info success';
                statusDiv.innerHTML = `
                    <p><strong>✓ 配置状态：已完成</strong></p>
                    <p>App ID: ${result.app_id}</p>
                    <p>App Secret: ${result.app_secret}</p>
                    <p>User Access Token: ${result.user_token || '已配置'}</p>
                    <p style="margin-top: 1rem; color: #52c41a;">所有配置已就绪，可以使用飞书文档功能</p>
                `;
                authBtn.style.display = 'none';
                refreshTokenBtn.style.display = 'inline-block';
            } else if (result.has_token && !result.token_valid) {
                // Token 已过期
                statusDiv.className = 'status-info error';
                let errorMsg = result.token_error_msg ? `<p>错误信息: ${result.token_error_msg}</p>` : '';
                statusDiv.innerHTML = `
                    <p><strong>⚠ Token 已过期</strong></p>
                    <p>App ID: ${result.app_id}</p>
                    <p>App Secret: ${result.app_secret}</p>
                    <p>User Access Token: ${result.user_token || '已配置但已过期'}</p>
                    ${errorMsg}
                    <p style="margin-top: 1rem; color: #cf1322;">User Access Token 已过期，请重新授权</p>
                `;
                authBtn.style.display = 'inline-block';
                authBtn.textContent = '重新授权';
                refreshTokenBtn.style.display = 'none';
            } else {
                // 没有 Token
                statusDiv.className = 'status-info warning';
                statusDiv.innerHTML = `
                    <p><strong>⚠ 配置状态：需要授权</strong></p>
                    <p>App ID: ${result.app_id}</p>
                    <p>App Secret: ${result.app_secret}</p>
                    <p style="margin-top: 1rem;">请点击下方按钮完成用户授权</p>
                `;
                authBtn.style.display = 'inline-block';
                authBtn.textContent = '开始授权';
                refreshTokenBtn.style.display = 'none';
            }
        } else {
            statusDiv.className = 'status-info warning';
            statusDiv.innerHTML = `
                <p><strong>⚠ 配置状态：未配置</strong></p>
                <p>请先填写 App ID 和 App Secret</p>
            `;
            authBtn.style.display = 'none';
            refreshTokenBtn.style.display = 'none';
        }
    } catch (error) {
        statusDiv.className = 'status-info error';
        statusDiv.innerHTML = `<p>获取配置状态失败: ${error.message}</p>`;
    }
}

// 保存配置
async function saveConfig() {
    const appId = document.getElementById('app-id').value.trim();
    const appSecret = document.getElementById('app-secret').value.trim();
    const saveBtn = document.getElementById('save-config-btn');
    const statusDiv = document.getElementById('config-status');

    if (!appId || !appSecret) {
        alert('请填写完整的 App ID 和 App Secret');
        return;
    }

    // 禁用按钮
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
        const response = await fetch('/api/config/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                app_id: appId,
                app_secret: appSecret
            })
        });

        const result = await response.json();

        if (result.success) {
            // 只清空 App Secret 输入框，保留 App ID
            document.getElementById('app-secret').value = '';

            // 显示成功消息
            statusDiv.className = 'status-info success';
            statusDiv.innerHTML = `
                <p><strong>✓ 配置保存成功！</strong></p>
                <p>App ID: ${result.app_id}</p>
                <p style="margin-top: 1rem;">接下来请点击下方"开始授权"按钮完成用户授权</p>
            `;

            // 延迟重新加载配置状态，显示授权按钮
            setTimeout(() => {
                loadConfigStatus();
            }, 1000);
        } else {
            alert('保存配置失败: ' + (result.msg || '未知错误'));
            statusDiv.className = 'status-info error';
            statusDiv.innerHTML = `<p><strong>保存失败</strong></p><p>${result.msg || '未知错误'}</p>`;
        }
    } catch (error) {
        alert('保存配置失败: ' + error.message);
        statusDiv.className = 'status-info error';
        statusDiv.innerHTML = `<p><strong>保存失败</strong></p><p>${error.message}</p>`;
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存配置';
    }
}

// 开始授权
async function startAuth() {
    const authBtn = document.getElementById('start-auth-btn');
    const statusDiv = document.getElementById('config-status');

    authBtn.disabled = true;
    authBtn.textContent = '授权中...';

    try {
        const response = await fetch('/api/config/start_auth');
        const result = await response.json();

        if (result.auth_url) {
            statusDiv.className = 'status-info';
            statusDiv.innerHTML = '<p>正在打开授权窗口，请在弹出窗口中完成授权...</p>';

            // 打开授权窗口
            const authWindow = window.open(
                result.auth_url,
                'feishu_auth',
                'width=600,height=700'
            );

            // 监听授权回调消息
            window.addEventListener('message', function authCallback(event) {
                if (event.data.type === 'auth_success') {
                    statusDiv.className = 'status-info success';
                    statusDiv.innerHTML = '<p><strong>授权成功！</strong></p><p>User Access Token 已保存</p>';
                    authBtn.style.display = 'none';

                    // 移除事件监听器
                    window.removeEventListener('message', authCallback);

                    // 刷新配置状态
                    setTimeout(() => {
                        loadConfigStatus();
                    }, 1000);
                } else if (event.data.type === 'auth_error') {
                    statusDiv.className = 'status-info error';
                    statusDiv.innerHTML = `<p><strong>授权失败</strong></p><p>${event.data.message}</p>`;
                    authBtn.disabled = false;
                    authBtn.textContent = '开始授权';

                    // 移除事件监听器
                    window.removeEventListener('message', authCallback);
                }
            });
        } else {
            alert('获取授权 URL 失败: ' + (result.msg || '未知错误'));
            authBtn.disabled = false;
            authBtn.textContent = '开始授权';
        }
    } catch (error) {
        alert('开始授权失败: ' + error.message);
        authBtn.disabled = false;
        authBtn.textContent = '开始授权';
    }
}

// 初始化配置页面事件
function initConfigEvents() {
    const saveBtn = document.getElementById('save-config-btn');
    const authBtn = document.getElementById('start-auth-btn');
    const refreshTokenBtn = document.getElementById('refresh-token-btn');

    if (saveBtn) {
        saveBtn.addEventListener('click', saveConfig);
    }

    if (authBtn) {
        authBtn.addEventListener('click', startAuth);
    }

    if (refreshTokenBtn) {
        refreshTokenBtn.addEventListener('click', startAuth);  // 重新获取 Token 也是调用 startAuth
    }
}

// ============================================
// 原有功能
// ============================================

// 通用函数：获取API数据
async function fetchAPI(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('获取数据失败:', error);
        return { code: 1, msg: `获取数据失败: ${error.message}`, data: null };
    }
}

// 通用函数：显示加载中
function showLoading(element) {
    element.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
        </div>
    `;
}

// 通用函数：显示错误信息
function showError(element, message) {
    element.innerHTML = `
        <div class="alert-error">
            <p>${message}</p>
        </div>
    `;
}

// 首页：加载所有知识库
async function loadSpaces() {
    const spacesContainer = document.getElementById('spaces-container');
    if (!spacesContainer) return;
    
    showLoading(spacesContainer);
    
    const result = await fetchAPI('/api/spaces');
    
    if (result.code === 0 && result.data && result.data.spaces) {
        if (result.data.spaces.length === 0) {
            spacesContainer.innerHTML = '<p>暂无知识库</p>';
            return;
        }
        
        let html = '<div class="spaces-grid">';
        
        result.data.spaces.forEach(space => {
            html += `
                <div class="space-card" onclick="window.location.href='/space/${space.space_id}'">
                    <h3>${space.name}</h3>
                    <p>${space.description || '暂无描述'}</p>
                </div>
            `;
        });
        
        html += '</div>';
        spacesContainer.innerHTML = html;
    } else {
        showError(spacesContainer, result.msg || '获取知识库列表失败');
    }
}

// 知识库页面：加载知识库信息和节点列表
async function loadSpaceInfo(spaceId) {
    const sidebarContainer = document.getElementById('sidebar-container');
    const contentHeader = document.getElementById('content-header');
    
    if (!sidebarContainer || !contentHeader) return;
    
    showLoading(sidebarContainer);
    showLoading(contentHeader);
    
    // 获取知识库节点列表
    const result = await fetchAPI(`/api/space/${spaceId}/nodes`);
    
    if (result.code === 0 && result.data && result.data.nodes) {
        // 渲染侧边栏节点列表
        if (result.data.nodes.length === 0) {
            sidebarContainer.innerHTML = '<p class="empty-message">暂无节点</p>';
        } else {
            let html = '<ul class="node-list">';
            
            result.data.nodes.forEach(node => {
                html += `
                    <li class="node-item" data-node-id="${node.obj_token}" onclick="loadNodeDetail('${node.obj_token}', '${node.title}')">
                        ${node.title}
                    </li>
                `;
            });
            
            html += '</ul>';
            sidebarContainer.innerHTML = html;
        }
        
        // 获取知识库基本信息（从第一个节点）
        if (result.data.nodes.length > 0) {
            const firstNode = result.data.nodes[0];
            contentHeader.innerHTML = `
                <h2>${firstNode.title}</h2>
                <div class="breadcrumb">
                    <span class="breadcrumb-item"><a href="/">首页</a></span>
                    <span class="breadcrumb-item">${firstNode.title}</span>
                </div>
            `;
            
            // 默认加载第一个节点的详情
            loadNodeDetail(firstNode.obj_token, firstNode.title);
        } else {
            contentHeader.innerHTML = `
                <h2>知识库</h2>
                <div class="breadcrumb">
                    <span class="breadcrumb-item"><a href="/">首页</a></span>
                    <span class="breadcrumb-item">知识库</span>
                </div>
            `;
        }
    } else {
        showError(sidebarContainer, '获取节点列表失败');
        showError(contentHeader, result.msg || '获取知识库信息失败');
    }
}

// 知识库页面：加载节点详情
async function loadNodeDetail(nodeId, nodeTitle) {
    const contentBody = document.getElementById('content-body');
    const contentHeader = document.getElementById('content-header');
    
    if (!contentBody || !contentHeader) return;
    
    // 更新面包屑和标题
    contentHeader.innerHTML = `
        <h2>${nodeTitle}</h2>
        <div class="breadcrumb">
            <span class="breadcrumb-item"><a href="/">首页</a></span>
            <span class="breadcrumb-item">${nodeTitle}</span>
        </div>
    `;
    
    // 高亮选中的节点
    document.querySelectorAll('.node-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.nodeId === nodeId) {
            item.classList.add('active');
        }
    });
    
    showLoading(contentBody);
    
    const result = await fetchAPI(`/api/node/${nodeId}`);
    
    if (result.code === 0 && result.data) {
        // 显示HTML内容
        contentBody.innerHTML = `
            <div class="html-content">
                ${result.data.content}
            </div>
        `;
    } else {
        showError(contentBody, result.msg || '获取节点详情失败');
    }
}

// 加载视频
function loadVideo(placeholder) {
    const videoUrl = placeholder.getAttribute('data-video-url');
    if (!videoUrl) return;
    
    // 创建视频元素
    const video = document.createElement('video');
    video.controls = true;
    video.width = '100%';
    video.innerHTML = `<source src="${videoUrl}" type="video/mp4">您的浏览器不支持视频标签。`;
    
    // 替换占位符
    placeholder.parentNode.replaceChild(video, placeholder);
    
    // 自动播放视频
    video.play().catch(e => console.log('自动播放失败，需要用户交互:', e));
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 初始化菜单点击事件
    initMenuEvents();

    // 初始化配置页面事件
    initConfigEvents();

    // 检测当前页面并执行相应的初始化函数
    const path = window.location.pathname;

    if (path === '/') {
        // 首页 - 默认显示首页视图
        switchView('home');
    } else if (path.startsWith('/space/')) {
        // 知识库页面
        const spaceId = path.split('/').pop();
        loadSpaceInfo(spaceId);
    }

    // 全局事件委托，处理视频占位符点击
    document.body.addEventListener('click', function(event) {
        // 查找被点击的视频占位符
        let placeholder = event.target.closest('.video-placeholder');
        if (placeholder) {
            loadVideo(placeholder);
        }
    });
});
