const { contextBridge, ipcRenderer } = require('electron');

/**
 * Define a safe bridge accessible from the renderer.
 * Extend the required APIs below.
 */
contextBridge.exposeInMainWorld('desktopAPI', {
  ping: () => ipcRenderer.invoke('ping'),

  // 获取应用版本
  getAppVersion: () => {
    const versionArg = process.argv.find(arg => arg.startsWith('--app-version='));
    return versionArg ? versionArg.split('=')[1] : 'Unknown';
  },

  // 窗口控制API
  windowControls: {
    minimize: () => ipcRenderer.invoke('window-control', { action: 'minimize' }),
    maximizeOrRestore: () => ipcRenderer.invoke('window-control', { action: 'toggle-maximize' }),
    close: () => ipcRenderer.invoke('window-control', { action: 'close' }),
    getState: () => ipcRenderer.invoke('get-window-state'),
    onStateChange: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }
      const handler = (event, state) => callback(state);
      ipcRenderer.on('window-state-changed', handler);
      return () => ipcRenderer.removeListener('window-state-changed', handler);
    }
  },

  // 导航控制API
  navigationControls: {
    goBack: () => ipcRenderer.invoke('window-navigation', { action: 'back' }),
    goForward: () => ipcRenderer.invoke('window-navigation', { action: 'forward' }),
    refresh: (force = false) => ipcRenderer.invoke('window-navigation', { action: force ? 'force-refresh' : 'refresh' }),
    toggleDevTools: () => ipcRenderer.invoke('window-navigation', { action: 'toggle-devtools' }),
    getState: () => ipcRenderer.invoke('get-navigation-state'),
    onStateChange: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }
      const handler = (event, state) => callback(state);
      ipcRenderer.on('navigation-state-changed', handler);
      return () => ipcRenderer.removeListener('navigation-state-changed', handler);
    }
  },

  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

// ==================== 自定义标题栏实现 ====================

const SHOULD_USE_CUSTOM_TITLEBAR = process.argv.includes('--enable-custom-titlebar');
const TITLEBAR_ID = 'electron-custom-titlebar';
const TITLEBAR_STYLE_ID = 'electron-custom-titlebar-style';
const TITLEBAR_HEIGHT = 40;
const APP_ROOT_CLASS = 'electron-app-root';

// 从启动参数中读取版本号
const getAppVersion = () => {
  const versionArg = process.argv.find(arg => arg.startsWith('--app-version='));
  return versionArg ? versionArg.split('=')[1] : 'Unknown';
};
const APP_VERSION = getAppVersion();

const ensureLayoutStyles = () => {
  if (document.getElementById(TITLEBAR_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = TITLEBAR_STYLE_ID;
  style.textContent = `
:root.electron-custom-titlebar-active {
  --electron-titlebar-height: ${TITLEBAR_HEIGHT}px;
  scroll-padding-top: ${TITLEBAR_HEIGHT}px;
}
/* 不限制html和body的overflow，让页面正常滚动 */
body.electron-custom-titlebar-active {
  margin: 0;
  box-sizing: border-box;
}
`;

  (document.head || document.documentElement).appendChild(style);
};

const setButtonEnabledState = (button, enabled = true) => {
  button.disabled = !enabled;
  button.style.opacity = enabled ? '1' : '0.45';
  button.style.cursor = enabled ? 'pointer' : 'default';
};

const createToolbarButton = (label, ariaLabel, options = {}) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  button.textContent = label;
  Object.assign(button.style, {
    width: options.width || '34px',
    height: options.height || '26px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#e2e8f0',
    fontSize: options.fontSize || '14px',
    fontWeight: options.fontWeight || 'normal',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, opacity 0.1s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });
  button.style.webkitAppRegion = 'no-drag';

  const setBackground = (value) => {
    button.style.backgroundColor = value;
  };

  button.addEventListener('mouseenter', () => {
    if (!button.disabled) {
      setBackground('rgba(255, 255, 255, 0.12)');
    }
  });
  button.addEventListener('mouseleave', () => setBackground('transparent'));
  button.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    if (!button.disabled) {
      setBackground('rgba(255, 255, 255, 0.2)');
    }
  });
  button.addEventListener('mouseup', () => {
    if (!button.disabled) {
      setBackground('rgba(255, 255, 255, 0.12)');
    }
  });

  return button;
};

const applyLayoutAdjustments = (body, titleBar) => {
  ensureLayoutStyles();

  const htmlElement = document.documentElement;
  htmlElement.classList.add('electron-custom-titlebar-active');
  body.classList.add('electron-custom-titlebar-active');

  // 设置CSS变量，供全局CSS使用
  htmlElement.style.setProperty('--electron-titlebar-height', `${TITLEBAR_HEIGHT}px`);

  // 简化布局调整 - 只设置body的padding-top
  const computedPadding = parseFloat(window.getComputedStyle(body).paddingTop || '0') || 0;
  body.dataset.electronOriginalPaddingTop = String(computedPadding);
  body.style.paddingTop = `${computedPadding + TITLEBAR_HEIGHT}px`;

  // 不强制设置overflow和height，让页面自然滚动
  // body.style.height = '100vh';
  // body.style.minHeight = '100vh';
  // body.style.boxSizing = 'border-box';
  // body.style.overflow = 'hidden';
  // htmlElement.style.overflow = 'hidden';
  // htmlElement.style.height = '100vh';
  // htmlElement.style.minHeight = '100vh';

  htmlElement.style.scrollPaddingTop = `${TITLEBAR_HEIGHT}px`;

  // 不再强制识别和调整app root，让CSS处理
  // const appRootCandidate = Array.from(body.children)
  //   .find((node) => {
  //     if (node === titleBar || node.nodeType !== Node.ELEMENT_NODE) {
  //       return false;
  //     }
  //     const tagName = node.tagName || '';
  //     return tagName.toLowerCase() !== 'script' && tagName.toLowerCase() !== 'style';
  //   });
  // if (appRootCandidate) {
  //   appRootCandidate.classList.add(APP_ROOT_CLASS);
  // }
};

const initCustomTitleBar = () => {
  if (!SHOULD_USE_CUSTOM_TITLEBAR) {
    return;
  }

  if (!document || document.getElementById(TITLEBAR_ID)) {
    return;
  }

  const body = document.body;
  if (!body) {
    window.requestAnimationFrame(initCustomTitleBar);
    return;
  }

  const titleBar = document.createElement('div');
  titleBar.id = TITLEBAR_ID;
  Object.assign(titleBar.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: `${TITLEBAR_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px 0 16px',
    background: 'linear-gradient(90deg, #0f172a, #1e293b)',
    color: '#e2e8f0',
    fontFamily: '"Segoe UI", "PingFang SC", "Microsoft Yahei", sans-serif',
    fontSize: '14px',
    zIndex: '2147483646',
    boxSizing: 'border-box',
    boxShadow: '0 1px 6px rgba(0, 0, 0, 0.35)'
  });
  titleBar.style.webkitAppRegion = 'drag';

  const navGroup = document.createElement('div');
  Object.assign(navGroup.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  });
  navGroup.style.webkitAppRegion = 'no-drag';
  navGroup.addEventListener('dblclick', (event) => event.stopPropagation());

  const controlsSection = document.createElement('div');
  Object.assign(controlsSection.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  });
  controlsSection.style.webkitAppRegion = 'no-drag';
  controlsSection.addEventListener('dblclick', (event) => event.stopPropagation());

  const leftSection = document.createElement('div');
  Object.assign(leftSection.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: '1',
    minWidth: '0'
  });
  leftSection.style.webkitAppRegion = 'drag';

  const rightSection = document.createElement('div');
  Object.assign(rightSection.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });
  rightSection.style.webkitAppRegion = 'no-drag';

  const createNavButton = (label, ariaLabel, action, options = {}) => {
    const button = createToolbarButton(label, ariaLabel, {
      width: '30px',
      height: '24px',
      fontSize: options.fontSize || '13px'
    });

    const handleClick = async (event) => {
      event.stopPropagation();
      if (button.disabled) {
        return;
      }

      const payloadAction = action === 'refresh' && event.shiftKey ? 'force-refresh' : action;

      try {
        const response = await ipcRenderer.invoke('window-navigation', { action: payloadAction });
        if (response && response.state) {
          updateNavigationButtons(response.state);
        }
      } catch (error) {
        console.error(`执行导航操作失败: ${action}`, error);
      }
    };

    button.addEventListener('click', handleClick);
    return button;
  };

  const backButton = createNavButton('←', '后退', 'back');
  const forwardButton = createNavButton('→', '前进', 'forward');
  const refreshButton = createNavButton('⟳', '刷新', 'refresh');
  setButtonEnabledState(backButton, false);
  setButtonEnabledState(forwardButton, false);

  const updateNavigationButtons = (state = {}) => {
    setButtonEnabledState(backButton, !!state.canGoBack);
    setButtonEnabledState(forwardButton, !!state.canGoForward);
  };

  navGroup.appendChild(backButton);
  navGroup.appendChild(forwardButton);
  navGroup.appendChild(refreshButton);

  const titleSection = document.createElement('div');
  Object.assign(titleSection.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '500',
    minWidth: '0'
  });
  titleSection.style.webkitAppRegion = 'drag';

  const statusDot = document.createElement('span');
  Object.assign(statusDot.style, {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    backgroundColor: '#38bdf8',
    display: 'inline-block',
    boxShadow: '0 0 8px rgba(56, 189, 248, 0.6)'
  });

  const titleText = document.createElement('span');
  titleText.textContent = `Goodable v${APP_VERSION}`;
  Object.assign(titleText.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  });

  titleSection.appendChild(statusDot);
  titleSection.appendChild(titleText);

  const minimizeButton = createToolbarButton('–', '最小化');
  minimizeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    ipcRenderer.invoke('window-control', { action: 'minimize' });
  });

  const maximizeButton = createToolbarButton('▢', '最大化或还原');
  const updateMaximizeVisual = (isMaximized = false) => {
    maximizeButton.setAttribute('data-maximized', isMaximized ? 'true' : 'false');
    maximizeButton.textContent = isMaximized ? '❐' : '▢';
    maximizeButton.setAttribute('aria-label', isMaximized ? '还原窗口' : '最大化窗口');
  };

  maximizeButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      const response = await ipcRenderer.invoke('window-control', { action: 'toggle-maximize' });
      if (response && response.state) {
        updateMaximizeVisual(response.state.isMaximized);
      }
    } catch (error) {
      console.error('切换窗口大小失败:', error);
    }
  });

  const closeButton = createToolbarButton('×', '关闭窗口', { fontSize: '15px' });
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.backgroundColor = '#ef4444';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.backgroundColor = 'transparent';
  });
  closeButton.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    closeButton.style.backgroundColor = '#b91c1c';
  });
  closeButton.addEventListener('mouseup', () => {
    closeButton.style.backgroundColor = '#ef4444';
  });
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    ipcRenderer.invoke('window-control', { action: 'close' });
  });

  const devToolsButton = createToolbarButton('</>', '切换开发者工具', {
    width: '42px',
    fontSize: '13px'
  });
  // 开发环境显示开发者工具按钮
  devToolsButton.style.display = process.env.NODE_ENV === 'development' ? 'flex' : 'none';
  devToolsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    ipcRenderer.invoke('window-navigation', { action: 'toggle-devtools' });
  });

  controlsSection.appendChild(minimizeButton);
  controlsSection.appendChild(maximizeButton);
  controlsSection.appendChild(closeButton);

  leftSection.appendChild(titleSection);

  rightSection.appendChild(navGroup);
  rightSection.appendChild(devToolsButton);
  rightSection.appendChild(controlsSection);

  titleBar.appendChild(leftSection);
  titleBar.appendChild(rightSection);

  body.prepend(titleBar);
  applyLayoutAdjustments(body, titleBar);

  ipcRenderer.invoke('get-window-state')
    .then((state) => updateMaximizeVisual(state?.isMaximized))
    .catch(() => updateMaximizeVisual(false));

  ipcRenderer.on('window-state-changed', (event, state) => {
    updateMaximizeVisual(state?.isMaximized);
  });

  const requestNavState = () => {
    ipcRenderer.invoke('get-navigation-state')
      .then((state) => updateNavigationButtons(state))
      .catch(() => updateNavigationButtons({}));
  };

  ipcRenderer.on('navigation-state-changed', (event, state) => {
    updateNavigationButtons(state);
  });

  requestNavState();

  titleBar.addEventListener('dblclick', () => {
    ipcRenderer.invoke('window-control', { action: 'toggle-maximize' });
  });
};

if (SHOULD_USE_CUSTOM_TITLEBAR) {
  // 延迟创建，等待 React hydration 完成
  // 使用 window.load 而不是 DOMContentLoaded
  const createTitleBarAfterHydration = () => {
    console.log('[Preload] 准备创建标题栏...');

    // 等待一小段时间确保 React hydration 完成
    setTimeout(() => {
      console.log('[Preload] 开始创建标题栏（React hydration 后）');
      initCustomTitleBar();

      // 监听 DOM 变化，如果标题栏被删除则重新创建
      const observer = new MutationObserver(() => {
        if (!document.getElementById(TITLEBAR_ID)) {
          console.log('[Preload] 标题栏被删除，重新创建...');
          initCustomTitleBar();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: false
      });
    }, 100); // 延迟 100ms
  };

  if (document.readyState === 'complete') {
    createTitleBarAfterHydration();
  } else {
    window.addEventListener('load', createTitleBarAfterHydration, { once: true });
  }
}
