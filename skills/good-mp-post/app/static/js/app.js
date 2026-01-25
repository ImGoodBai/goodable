/**
 * Good MP Post - Web UI JavaScript
 * Vanilla JS implementation for article management
 */

// API Base URL
const API_BASE = '';

// Global state
let articles = [];
let currentArticleId = null;
let easyMDE = null;
let viewMode = 'edit'; // 'edit' / 'mobile' / 'desktop'

// Theme configurations (synced with backend JSON files)
const THEMES = {
  default: {
    body: { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.8', letterSpacing: '0.5px', fontWeight: '400' },
    h1: { fontSize: '22px', color: '#1a1a1a', fontWeight: '600' },
    h2: { fontSize: '19px', color: '#1a1a1a', fontWeight: '600', borderBottom: '2px solid #e5e5e5', paddingBottom: '8px' },
    h3: { fontSize: '17px', color: '#2a2a2a', fontWeight: '600' },
    blockquote: { fontSize: '14px', color: '#666', bgColor: '#f5f5f5', borderColor: '#d0d0d0' },
    list: { fontSize: '15px', color: '#3a3a3a' },
    code: { fontSize: '13px', color: '#d73a49', bgColor: '#f5f5f5' },
    pre: { fontSize: '13px', color: '#24292e', bgColor: '#f6f8fa' },
    strong: { fontWeight: '600', color: '#1a1a1a' },
    em: { color: '#3a3a3a' },
    link: { color: '#576b95' }
  },
  business: {
    body: { fontSize: '15px', color: '#3f3f46', lineHeight: '1.8', letterSpacing: '0.5px', fontWeight: '400' },
    h1: { fontSize: '22px', color: '#1e3a8a', fontWeight: '600' },
    h2: { fontSize: '19px', color: '#1e3a8a', fontWeight: '600', borderBottom: '2px solid #bfdbfe', paddingBottom: '8px' },
    h3: { fontSize: '17px', color: '#1e40af', fontWeight: '600' },
    blockquote: { fontSize: '14px', color: '#1e40af', bgColor: '#eff6ff', borderColor: '#3b82f6' },
    list: { fontSize: '15px', color: '#3f3f46' },
    code: { fontSize: '13px', color: '#1e40af', bgColor: '#eff6ff' },
    pre: { fontSize: '13px', color: '#1e40af', bgColor: '#eff6ff' },
    strong: { fontWeight: '600', color: '#1e3a8a' },
    em: { color: '#3f3f46' },
    link: { color: '#2563eb' }
  },
  fresh: {
    body: { fontSize: '15px', color: '#3f3f46', lineHeight: '1.8', letterSpacing: '0.5px', fontWeight: '400' },
    h1: { fontSize: '22px', color: '#059669', fontWeight: '600' },
    h2: { fontSize: '19px', color: '#059669', fontWeight: '600', borderBottom: '2px solid #bbf7d0', paddingBottom: '8px' },
    h3: { fontSize: '17px', color: '#10b981', fontWeight: '600' },
    blockquote: { fontSize: '14px', color: '#065f46', bgColor: '#f0fdf4', borderColor: '#10b981' },
    list: { fontSize: '15px', color: '#3f3f46' },
    code: { fontSize: '13px', color: '#065f46', bgColor: '#f0fdf4' },
    pre: { fontSize: '13px', color: '#065f46', bgColor: '#f0fdf4' },
    strong: { fontWeight: '600', color: '#059669' },
    em: { color: '#3f3f46' },
    link: { color: '#10b981' }
  }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initEasyMDE();
  initEventListeners();
  loadArticles();
  applyThemeToPreview('default'); // Apply default theme on page load
});

// Initialize EasyMDE
function initEasyMDE() {
  easyMDE = new EasyMDE({
    element: document.getElementById('inputContent'),
    spellChecker: false,
    placeholder: '请输入文章内容，支持 Markdown 格式...',
    status: false,
    toolbar: false,
    minHeight: '400px'
  });

  // Add image paste and drop handlers
  const codemirror = easyMDE.codemirror;

  // Handle paste event
  codemirror.on('paste', async (cm, event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        event.preventDefault();
        const file = item.getAsFile();
        await handleImageUpload(file, cm);
      }
    }
  });

  // Handle drop event
  codemirror.on('drop', async (cm, event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    for (const file of files) {
      if (file.type.indexOf('image') !== -1) {
        await handleImageUpload(file, cm);
      }
    }
  });
}

// Event listeners
function initEventListeners() {
  // New article button
  document.getElementById('btnNew').addEventListener('click', newArticle);

  // Save button
  document.getElementById('btnSave').addEventListener('click', saveArticle);

  // View mode buttons
  document.getElementById('btnEdit').addEventListener('click', () => switchViewMode('edit'));
  document.getElementById('btnMobilePreview').addEventListener('click', () => switchViewMode('mobile'));
  document.getElementById('btnDesktopPreview').addEventListener('click', () => switchViewMode('desktop'));

  // Publish button
  document.getElementById('btnPublish').addEventListener('click', publishArticle);

  // Cover image upload
  document.getElementById('inputCover').addEventListener('change', handleCoverUpload);

  // Theme selector
  document.getElementById('themeSelector').addEventListener('change', handleThemeChange);

  // Markdown toolbar buttons
  document.getElementById('btnBold').addEventListener('click', () => insertMarkdown('**', '**'));
  document.getElementById('btnItalic').addEventListener('click', () => insertMarkdown('*', '*'));
  document.getElementById('btnHeading').addEventListener('click', insertHeading);
  document.getElementById('btnList').addEventListener('click', insertList);
  document.getElementById('btnQuote').addEventListener('click', () => insertMarkdown('\n> ', ''));
  document.getElementById('btnCode').addEventListener('click', () => insertMarkdown('`', '`'));

  // Copy HTML button
  document.getElementById('btnCopyHtml').addEventListener('click', copyWechatHtml);
}

// Switch view mode
function switchViewMode(mode) {
  viewMode = mode;

  const btnEdit = document.getElementById('btnEdit');
  const btnMobilePreview = document.getElementById('btnMobilePreview');
  const btnDesktopPreview = document.getElementById('btnDesktopPreview');
  const editorSection = document.querySelector('.editor-section');

  // Update button states
  btnEdit.classList.remove('active');
  btnMobilePreview.classList.remove('active');
  btnDesktopPreview.classList.remove('active');

  if (mode === 'edit') {
    btnEdit.classList.add('active');
    if (easyMDE.isPreviewActive()) {
      easyMDE.togglePreview();
    }
  } else if (mode === 'mobile') {
    btnMobilePreview.classList.add('active');
    if (!easyMDE.isPreviewActive()) {
      easyMDE.togglePreview();
    }
    editorSection.classList.remove('desktop-preview');
    editorSection.classList.add('mobile-preview');
  } else if (mode === 'desktop') {
    btnDesktopPreview.classList.add('active');
    if (!easyMDE.isPreviewActive()) {
      easyMDE.togglePreview();
    }
    editorSection.classList.remove('mobile-preview');
    editorSection.classList.add('desktop-preview');
  }
}

// Load articles
async function loadArticles() {
  try {
    const response = await fetch(`${API_BASE}/api/articles`);
    if (!response.ok) throw new Error('Failed to load articles');

    articles = await response.json();
    renderArticleList();
  } catch (error) {
    showToast('加载文章失败: ' + error.message, 'error');
  }
}

// Render article list
function renderArticleList() {
  const container = document.getElementById('articleList');

  if (articles.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999; font-size: 13px;">暂无文章</div>';
    return;
  }

  container.innerHTML = articles.map(article => `
    <div class="article-item ${currentArticleId === article.id ? 'active' : ''}"
         onclick="loadArticle(${article.id})">
      <div class="article-title">${escapeHtml(article.title)}</div>
      <div class="article-meta">
        <span class="status-${article.status}">${getStatusText(article.status)}</span>
        <span style="margin: 0 4px;">·</span>
        <span>${formatDate(article.created_at)}</span>
      </div>
    </div>
  `).join('');
}

// New article
function newArticle() {
  currentArticleId = null;
  clearEditor();
  showEditor();
  // Reset to edit mode
  switchViewMode('edit');
  // Apply default theme
  document.getElementById('themeSelector').value = 'default';
  applyThemeToPreview('default');
}

// Load article
window.loadArticle = async function(id) {
  try {
    const response = await fetch(`${API_BASE}/api/articles/${id}`);
    if (!response.ok) throw new Error('Failed to load article');

    const article = await response.json();
    currentArticleId = id;

    document.getElementById('inputTitle').value = article.title || '';
    document.getElementById('inputAuthor').value = article.author || '';
    document.getElementById('inputDigest').value = article.digest || '';

    // Set EasyMDE content
    if (easyMDE) {
      easyMDE.value(article.content_md || '');
    }

    // Show cover preview if exists
    if (article.thumb_url) {
      document.getElementById('coverPreview').innerHTML =
        `<img src="${article.thumb_url}" style="border: 1px solid #e5e5e5;">`;
    } else {
      document.getElementById('coverPreview').innerHTML = '';
    }

    // Set theme selector
    document.getElementById('themeSelector').value = article.theme || 'default';

    showEditor();
    renderArticleList(); // Update selection
    // Reset to edit mode
    switchViewMode('edit');
    // Apply theme to preview
    applyThemeToPreview(article.theme || 'default');
  } catch (error) {
    showToast('加载文章失败: ' + error.message, 'error');
  }
};

// Save article
async function saveArticle() {
  const title = document.getElementById('inputTitle').value.trim();
  const author = document.getElementById('inputAuthor').value.trim();
  const digest = document.getElementById('inputDigest').value.trim();
  const content = easyMDE ? easyMDE.value().trim() : '';

  if (!title) {
    showToast('请输入文章标题', 'error');
    return;
  }

  if (!content) {
    showToast('请输入文章内容', 'error');
    return;
  }

  try {
    showLoading();

    const data = {
      title,
      author: author || '作者',
      digest,
      content_md: content,
      theme: document.getElementById('themeSelector').value
    };
    const url = currentArticleId
      ? `${API_BASE}/api/articles/${currentArticleId}`
      : `${API_BASE}/api/articles`;
    const method = currentArticleId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '保存失败');
    }

    const article = await response.json();
    currentArticleId = article.id;

    showToast(currentArticleId ? '文章已保存' : '文章已创建', 'success');
    await loadArticles();
  } catch (error) {
    showToast('保存失败: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

// Publish article
async function publishArticle() {
  if (!currentArticleId) {
    showToast('请先保存文章', 'error');
    return;
  }

  if (!confirm('确定要发布到公众号吗？\n\n注意：订阅号需要登录微信公众平台手动发布草稿。')) {
    return;
  }

  try {
    showLoading();

    const response = await fetch(`${API_BASE}/api/articles/${currentArticleId}/publish`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '发布失败');
    }

    const result = await response.json();
    showToast(`草稿创建成功！\n\nmedia_id: ${result.draft_media_id}\n\n请登录微信公众平台手动发布。`, 'success');
    await loadArticles();
  } catch (error) {
    showToast('发布失败: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

// Handle image upload (for content images)
async function handleImageUpload(file, cm) {
  // Validate file size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过 5MB', 'error');
    return;
  }

  // Check if article is saved
  if (!currentArticleId) {
    showToast('请先保存文章再插入图片', 'error');
    return;
  }

  try {
    // Show uploading placeholder
    const cursor = cm.getCursor();
    const uploadingText = '![上传中...](uploading)';
    cm.replaceRange(uploadingText, cursor);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'image');  // Content image, not thumb
    formData.append('article_id', currentArticleId);

    const response = await fetch(`${API_BASE}/api/images/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '上传失败');
    }

    const result = await response.json();

    // Replace placeholder with actual image URL
    const currentContent = cm.getValue();
    const newContent = currentContent.replace(
      uploadingText,
      `![${file.name}](${result.url})`
    );
    cm.setValue(newContent);

    showToast('图片上传成功', 'success');
  } catch (error) {
    // Remove uploading placeholder on error
    const currentContent = cm.getValue();
    const newContent = currentContent.replace('![上传中...](uploading)', '');
    cm.setValue(newContent);

    showToast('图片上传失败: ' + error.message, 'error');
  }
}

// Handle cover upload
async function handleCoverUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Validate file size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过 5MB', 'error');
    e.target.value = '';
    return;
  }

  // Check if article is saved
  if (!currentArticleId) {
    showToast('请先保存文章再上传封面', 'error');
    e.target.value = '';
    return;
  }

  try {
    document.getElementById('uploadProgress').classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'thumb');  // Backend expects 'type' not 'media_type'
    formData.append('article_id', currentArticleId);  // Associate with current article

    const response = await fetch(`${API_BASE}/api/images/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '上传失败');
    }

    const result = await response.json();

    // Update article with media_id AND thumb_url
    const updateResponse = await fetch(`${API_BASE}/api/articles/${currentArticleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thumb_media_id: result.media_id,
        thumb_url: result.url  // Save URL so cover persists after reload
      })
    });

    if (!updateResponse.ok) {
      throw new Error('Failed to update article with cover');
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('coverPreview').innerHTML =
        `<img src="${e.target.result}" style="border: 1px solid #e5e5e5;">
         <p style="font-size: 12px; color: #07C160; margin-top: 6px;">✓ 上传成功</p>`;
    };
    reader.readAsDataURL(file);

    showToast('封面图上传成功', 'success');
  } catch (error) {
    showToast('上传失败: ' + error.message, 'error');
    document.getElementById('coverPreview').innerHTML = '';
  } finally {
    document.getElementById('uploadProgress').style.display = 'none';
  }
}

// Show/hide editor
function showEditor() {
  document.getElementById('editorContainer').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
}

function clearEditor() {
  document.getElementById('inputTitle').value = '';
  document.getElementById('inputAuthor').value = '';
  document.getElementById('inputDigest').value = '';
  if (easyMDE) {
    easyMDE.value('');
  }
  document.getElementById('inputCover').value = '';
  document.getElementById('coverPreview').innerHTML = '';
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return '今天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (days < 7) {
    return days + '天前';
  } else {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }
}

function getStatusText(status) {
  const statusMap = {
    'draft': '草稿',
    'synced': '已同步',
    'published': '已发布',
    'publishing': '发布中',
    'failed': '失败'
  };
  return statusMap[status] || status;
}

function showLoading() {
  // Simple loading state - could enhance with modal
  document.body.style.cursor = 'wait';
}

function hideLoading() {
  document.body.style.cursor = 'default';
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#07C160' : type === 'error' ? '#FA5151' : '#333'};
    color: white;
    font-size: 14px;
    z-index: 9999;
    max-width: 400px;
    white-space: pre-wrap;
    word-break: break-word;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.3s;
  `;

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.style.opacity = '1', 10);

  const delay = type === 'error' ? 10000 : 3000;
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, delay);

  toast.onclick = () => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  };
}

// Handle theme change
async function handleThemeChange() {
  const theme = document.getElementById('themeSelector').value;

  // Apply theme to preview immediately
  applyThemeToPreview(theme);

  // Save to backend if article exists
  if (!currentArticleId) {
    return; // No need to save if article doesn't exist yet
  }

  try {
    const response = await fetch(`${API_BASE}/api/articles/${currentArticleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme })
    });

    if (!response.ok) {
      throw new Error('Failed to update theme');
    }

    showToast('主题已切换', 'success');
  } catch (error) {
    showToast('主题切换失败: ' + error.message, 'error');
  }
}

// Insert markdown syntax around selection
function insertMarkdown(before, after) {
  if (!easyMDE) return;

  const cm = easyMDE.codemirror;
  const selection = cm.getSelection();
  const cursor = cm.getCursor();

  if (selection) {
    cm.replaceSelection(before + selection + after);
  } else {
    const placeholder = '文本';
    cm.replaceRange(before + placeholder + after, cursor);
    // Select the placeholder
    cm.setSelection(
      { line: cursor.line, ch: cursor.ch + before.length },
      { line: cursor.line, ch: cursor.ch + before.length + placeholder.length }
    );
  }

  cm.focus();
}

// Insert heading
function insertHeading() {
  if (!easyMDE) return;

  const cm = easyMDE.codemirror;
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);

  // Check if line already starts with heading
  const match = line.match(/^(#{1,6})\s/);

  if (match) {
    // Cycle through heading levels (## -> ### -> ## ...)
    const currentLevel = match[1].length;
    const nextLevel = currentLevel >= 3 ? 2 : currentLevel + 1;
    const newLine = '#'.repeat(nextLevel) + line.substring(match[0].length);
    cm.replaceRange(newLine, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
  } else {
    // Add ## heading
    cm.replaceRange('## ', { line: cursor.line, ch: 0 });
  }

  cm.focus();
}

// Insert list
function insertList() {
  if (!easyMDE) return;

  const cm = easyMDE.codemirror;
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);

  // Check if line already starts with list marker
  if (line.match(/^[-*]\s/)) {
    // Remove list marker
    const newLine = line.replace(/^[-*]\s/, '');
    cm.replaceRange(newLine, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
  } else {
    // Add list marker
    cm.replaceRange('- ', { line: cursor.line, ch: 0 });
  }

  cm.focus();
}

// Apply theme to preview
function applyThemeToPreview(themeName) {
  const theme = THEMES[themeName] || THEMES.default;

  // Remove existing theme style if any
  const existingStyle = document.getElementById('dynamic-theme-style');
  if (existingStyle) {
    existingStyle.remove();
  }

  // Create new style element
  const style = document.createElement('style');
  style.id = 'dynamic-theme-style';
  style.textContent = `
    .EasyMDEContainer .editor-preview p {
      margin: 10px 0;
      padding: 0;
      line-height: ${theme.body.lineHeight};
      font-size: ${theme.body.fontSize};
      color: ${theme.body.color};
      letter-spacing: ${theme.body.letterSpacing};
      font-weight: ${theme.body.fontWeight};
      text-align: justify;
    }
    .EasyMDEContainer .editor-preview h1 {
      margin: 30px 0 20px;
      padding: 0;
      font-size: ${theme.h1.fontSize};
      font-weight: ${theme.h1.fontWeight};
      color: ${theme.h1.color};
      line-height: 1.4;
    }
    .EasyMDEContainer .editor-preview h2 {
      margin: 53px 0 30px;
      padding: 0 0 8px 0;
      font-size: ${theme.h2.fontSize};
      font-weight: ${theme.h2.fontWeight};
      color: ${theme.h2.color};
      line-height: 1.4;
      border-bottom: ${theme.h2.borderBottom};
    }
    .EasyMDEContainer .editor-preview h3 {
      margin: 20px 0 12px;
      padding: 0;
      font-size: ${theme.h3.fontSize};
      font-weight: ${theme.h3.fontWeight};
      color: ${theme.h3.color};
      line-height: 1.4;
    }
    .EasyMDEContainer .editor-preview blockquote {
      margin: 15px 0;
      padding: 10px 15px;
      border-left: 3px solid ${theme.blockquote.borderColor};
      background-color: ${theme.blockquote.bgColor};
      color: ${theme.blockquote.color};
      font-size: ${theme.blockquote.fontSize};
      line-height: 1.6;
    }
    .EasyMDEContainer .editor-preview ul {
      margin: 10px 0;
      padding-left: 25px;
      list-style-type: disc;
    }
    .EasyMDEContainer .editor-preview ol {
      margin: 10px 0;
      padding-left: 25px;
      list-style-type: decimal;
    }
    .EasyMDEContainer .editor-preview li {
      margin: 5px 0;
      line-height: 1.6;
      font-size: ${theme.list.fontSize};
      color: ${theme.list.color};
    }
    .EasyMDEContainer .editor-preview strong {
      font-weight: ${theme.strong.fontWeight};
      color: ${theme.strong.color};
    }
    .EasyMDEContainer .editor-preview em {
      font-style: italic;
      color: ${theme.em.color};
    }
    .EasyMDEContainer .editor-preview code {
      padding: 2px 5px;
      background-color: ${theme.code.bgColor};
      border-radius: 3px;
      font-family: Consolas, Monaco, monospace;
      font-size: ${theme.code.fontSize};
      color: ${theme.code.color};
    }
    .EasyMDEContainer .editor-preview pre {
      margin: 15px 0;
      padding: 12px;
      background-color: ${theme.pre.bgColor};
      border-radius: 5px;
      overflow-x: auto;
      font-family: Consolas, Monaco, monospace;
      font-size: ${theme.pre.fontSize};
      line-height: 1.5;
      color: ${theme.pre.color};
    }
    .EasyMDEContainer .editor-preview pre code {
      padding: 0;
      background: transparent;
      color: inherit;
    }
    .EasyMDEContainer .editor-preview a {
      color: ${theme.link.color};
      text-decoration: underline;
    }
  `;

  document.head.appendChild(style);
}

// Copy WeChat HTML to clipboard
async function copyWechatHtml() {
  const content = easyMDE ? easyMDE.value().trim() : '';
  const theme = document.getElementById('themeSelector').value;

  if (!content) {
    showToast('请先输入文章内容', 'error');
    return;
  }

  try {
    showLoading();

    // Call backend API to convert Markdown to WeChat HTML
    // This ensures the HTML is EXACTLY the same as what will be published
    const response = await fetch(`${API_BASE}/api/articles/preview-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_md: content,
        theme: theme
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'HTML conversion failed');
    }

    const result = await response.json();

    // Copy rich text to clipboard (not HTML code string)
    // Create temporary container to render HTML
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.innerHTML = result.html;
    document.body.appendChild(tempContainer);

    // Select rendered content
    const range = document.createRange();
    range.selectNodeContents(tempContainer);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Copy selection (rich text format)
    let copySuccess = false;
    try {
      copySuccess = document.execCommand('copy');
    } catch (err) {
      console.error('execCommand copy failed:', err);
    }

    // Clean up
    selection.removeAllRanges();
    document.body.removeChild(tempContainer);

    if (copySuccess) {
      showToast('富文本已复制到剪贴板\n可直接粘贴到微信公众号后台测试格式', 'success');
    } else {
      throw new Error('浏览器复制功能失败');
    }
  } catch (error) {
    showToast('复制失败: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}


