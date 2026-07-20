/* ============================================================
   clone.js — 克隆仓库面板
   导出：{ id:'clone', name:'克隆', icon:'📥', init(container), cleanup() }
   功能：URL/路径输入、克隆进度显示、预设模板、克隆后自动打开
   ============================================================ */

const cloneModule = (() => {
  const id = 'clone';
  const name = '克隆';
  const icon = '📥';

  /** 当前是否活跃 */
  let active = false;
  /** 当前容器引用 */
  let containerEl = null;
  /** 克隆是否进行中 */
  let cloning = false;

  /** 预设仓库模板 */
  const TEMPLATES = [
    { name: 'VS Code', url: 'https://github.com/microsoft/vscode.git' },
    { name: 'React', url: 'https://github.com/facebook/react.git' },
    { name: 'Vue', url: 'https://github.com/vuejs/core.git' },
    { name: 'Node.js', url: 'https://github.com/nodejs/node.git' },
    { name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript.git' },
    { name: 'Electron', url: 'https://github.com/electron/electron.git' },
  ];

  /**
   * 初始化
   */
  async function init(container) {
    active = true;
    containerEl = container;
    cloning = false;

    renderPanel(container);
    bindEvents(container);
  }

  function cleanup() {
    active = false;
    containerEl = null;
    cloning = false;
  }

  /* ==================== 渲染 ==================== */

  function renderPanel(container) {
    const defaultPath = localStorage.getItem('gitui-default-clone-path') ||
      (window.state && window.state.currentRepo
        ? window.state.currentRepo.path.replace(/[\\/][^\\/]+$/, '')
        : getUserHomeDir());

    container.innerHTML = `
      <div style="max-width:720px;margin:0 auto;">
        <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:20px;">📥 克隆远程仓库</h2>

        <!-- 主要输入区域 -->
        <div class="card" style="margin-bottom:20px;">
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">
              🔗 远程仓库 URL
            </label>
            <input type="text" class="input" id="clone-url-input"
              placeholder="https://github.com/user/repo.git 或 git@github.com:user/repo.git"
              style="font-family:ui-monospace,monospace;font-size:13px;">
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">
              📂 本地目标路径
            </label>
            <div style="display:flex;gap:8px;">
              <input type="text" class="input" id="clone-path-input"
                placeholder="${escapeHtml(defaultPath)}"
                style="font-family:ui-monospace,monospace;font-size:13px;flex:1;">
              <button class="btn btn-sm" id="btn-browse-path" title="浏览文件夹（暂不支持，请手动输入）">📁</button>
            </div>
          </div>
          <button class="btn btn-primary" id="btn-start-clone" style="width:100%;justify-content:center;padding:10px 0;font-size:14px;">
            🚀 开始克隆
          </button>
        </div>

        <!-- 进度显示区域 -->
        <div id="clone-progress-area" style="display:none;margin-bottom:20px;">
          <div class="card">
            <div class="section-title">📡 克隆进度</div>
            <div id="clone-progress-bar" style="
              width:100%;height:6px;background:var(--surface-hover);border-radius:3px;overflow:hidden;margin-bottom:8px;
            ">
              <div id="clone-progress-fill" style="
                width:0%;height:100%;background:linear-gradient(90deg,var(--accent),#2ecc71);
                border-radius:3px;transition:width 0.3s ease;
              "></div>
            </div>
            <div id="clone-progress-text" style="font-size:11px;color:var(--text-secondary);font-family:ui-monospace,monospace;max-height:120px;overflow-y:auto;white-space:pre-wrap;">
              准备克隆...
            </div>
          </div>
        </div>

        <!-- 结果区域 -->
        <div id="clone-result-area" style="display:none;"></div>

        <!-- 预设模板 -->
        <div class="card" style="margin-bottom:20px;">
          <div class="section-title">⭐ 热门仓库模板</div>
          <p style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">
            点击快速填入仓库 URL
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;" id="clone-templates">
            ${TEMPLATES.map(t => `
              <button class="btn btn-sm clone-template-btn" data-url="${escapeHtml(t.url)}">
                ${escapeHtml(t.name)}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 使用说明 -->
        <div class="card">
          <div class="section-title">💡 使用说明</div>
          <ul style="font-size:12px;color:var(--text-secondary);line-height:2.0;padding-left:16px;">
            <li>支持 HTTPS 和 SSH 格式的远程仓库地址</li>
            <li>HTTPS 格式：<code>https://github.com/user/repo.git</code></li>
            <li>SSH 格式：<code>git@github.com:user/repo.git</code></li>
            <li>克隆完成后会自动打开该仓库</li>
            <li>默认克隆路径可在设置面板中修改</li>
          </ul>
        </div>
      </div>`;
  }

  function bindEvents(container) {
    // 模板按钮
    container.querySelectorAll('.clone-template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const urlInput = container.querySelector('#clone-url-input');
        if (urlInput) {
          urlInput.value = btn.dataset.url;
          urlInput.focus();
        }
      });
    });

    // 克隆按钮
    const cloneBtn = container.querySelector('#btn-start-clone');
    if (cloneBtn) {
      cloneBtn.addEventListener('click', () => startClone(container));
    }

    // 回车键提交（在 URL 输入框中按回车）
    const urlInput = container.querySelector('#clone-url-input');
    if (urlInput) {
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startClone(container);
      });
    }

    // 浏览按钮（暂为占位，提示用户手动输入）
    const browseBtn = container.querySelector('#btn-browse-path');
    if (browseBtn) {
      browseBtn.addEventListener('click', () => {
        window.toast('请手动输入本地路径（浏览器不支持文件系统浏览）', 'info');
      });
    }
  }

  /* ==================== 克隆操作 ==================== */

  async function startClone(container) {
    if (cloning) return;

    const urlInput = container.querySelector('#clone-url-input');
    const pathInput = container.querySelector('#clone-path-input');

    const url = (urlInput.value || '').trim();
    let targetPath = (pathInput.value || '').trim();
    const defaultPath = localStorage.getItem('gitui-default-clone-path') || getUserHomeDir();

    // 默认路径
    if (!targetPath) {
      targetPath = defaultPath;
    }

    // 校验 URL
    if (!url) {
      window.toast('请输入远程仓库 URL', 'error');
      urlInput && urlInput.focus();
      return;
    }

    if (!url.includes('://') && !url.startsWith('git@')) {
      window.toast('URL 格式不正确，需要包含协议或 git@ 前缀', 'error');
      return;
    }

    // 校验路径
    if (!targetPath) {
      window.toast('请输入本地目标路径', 'error');
      pathInput && pathInput.focus();
      return;
    }

    // 从 URL 中提取仓库名，拼接到目标路径
    const repoName = extractRepoName(url);
    const fullPath = targetPath.replace(/[\\/]$/, '') + '/' + repoName;

    // 显示进度区域
    cloning = true;
    const progressArea = container.querySelector('#clone-progress-area');
    const resultArea = container.querySelector('#clone-result-area');
    const cloneBtn = container.querySelector('#btn-start-clone');

    if (progressArea) progressArea.style.display = 'block';
    if (resultArea) resultArea.style.display = 'none';
    if (cloneBtn) {
      cloneBtn.disabled = true;
      cloneBtn.textContent = '⏳ 克隆中...';
    }

    updateProgress(container, 5, '正在连接远程仓库...\n');

    // 模拟进度更新（因为 git clone --progress 输出可能无法实时捕获）
    const progressInterval = setInterval(() => {
      const fill = container.querySelector('#clone-progress-fill');
      if (fill) {
        const currentWidth = parseFloat(fill.style.width) || 5;
        if (currentWidth < 90) {
          const newWidth = Math.min(currentWidth + Math.random() * 8, 90);
          fill.style.width = newWidth + '%';
          appendProgress(container, `接收对象中... ${Math.round(newWidth)}%\n`);
        }
      }
    }, 800);

    try {
      const result = await window.api.post('/api/repos/clone', {
        url,
        path: fullPath,
      });

      clearInterval(progressInterval);

      if (result.success) {
        updateProgress(container, 100, '克隆完成！\n');

        const fill = container.querySelector('#clone-progress-fill');
        if (fill) fill.style.width = '100%';

        // 显示结果
        if (resultArea) {
          resultArea.style.display = 'block';
          const repoInfo = result.data || {};
          resultArea.innerHTML = `
            <div class="card" style="border-left:3px solid #27ae60;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:24px;">✅</span>
                <span style="font-weight:700;color:#27ae60;">克隆成功！</span>
              </div>
              <p style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">
                仓库已克隆到：<code style="color:var(--accent);">${escapeHtml(fullPath)}</code>
              </p>
              <div style="margin-top:12px;display:flex;gap:8px;">
                <button class="btn btn-primary btn-sm" id="btn-open-cloned-repo" data-path="${escapeHtml(fullPath)}">
                  📂 打开此仓库
                </button>
              </div>
            </div>`;

          // 绑定打开按钮
          const openBtn = resultArea.querySelector('#btn-open-cloned-repo');
          if (openBtn) {
            openBtn.addEventListener('click', async () => {
              const path = openBtn.dataset.path;
              const openResult = await window.api.post('/api/repos/open', { path });
              if (openResult.success && openResult.data) {
                window.state.currentRepo = openResult.data;
                window.eventBus.emit('repo-changed', openResult.data);
                window.toast('仓库已打开', 'success');
                window.location.hash = '#dashboard';
              } else {
                window.toast(openResult.error || '打开仓库失败', 'error');
              }
            });
          }

          // 保存路径到 localStorage
          localStorage.setItem('gitui-default-clone-path', targetPath);
        }

        window.toast('克隆完成！', 'success');
      } else {
        updateProgress(container, 0, '克隆失败');
        const fill = container.querySelector('#clone-progress-fill');
        if (fill) fill.style.background = '#e74c3c';

        if (resultArea) {
          resultArea.style.display = 'block';
          resultArea.innerHTML = `
            <div class="card" style="border-left:3px solid #e74c3c;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:24px;">❌</span>
                <span style="font-weight:700;color:#e74c3c;">克隆失败</span>
              </div>
              <p style="font-size:12px;color:var(--text-secondary);">${escapeHtml(result.error || '未知错误')}</p>
            </div>`;
        }

        window.toast(result.error || '克隆失败', 'error');
      }
    } catch (e) {
      clearInterval(progressInterval);
      updateProgress(container, 0, '克隆出错');
      if (resultArea) {
        resultArea.style.display = 'block';
        resultArea.innerHTML = `
          <div class="card" style="border-left:3px solid #e74c3c;">
            <p style="color:#e74c3c;">❌ 克隆出错: ${escapeHtml(e.message)}</p>
          </div>`;
      }
      window.toast('克隆出错: ' + e.message, 'error');
    } finally {
      cloning = false;
      if (cloneBtn) {
        cloneBtn.disabled = false;
        cloneBtn.textContent = '🚀 开始克隆';
      }
    }
  }

  function updateProgress(container, percent, text) {
    const fill = container.querySelector('#clone-progress-fill');
    const textEl = container.querySelector('#clone-progress-text');

    if (fill) fill.style.width = percent + '%';
    if (textEl) textEl.textContent = text;
  }

  function appendProgress(container, text) {
    const textEl = container.querySelector('#clone-progress-text');
    if (textEl) {
      textEl.textContent += text;
      textEl.scrollTop = textEl.scrollHeight;
    }
  }

  /**
   * 从 URL 中提取仓库名
   */
  function extractRepoName(url) {
    // 去掉末尾的 .git 和斜杠
    let clean = url.replace(/\/+$/, '').replace(/\.git$/, '');
    // 取最后一个路径段
    const parts = clean.replace(/\\/g, '/').split('/');
    const last = parts[parts.length - 1];
    // 对 SSH 格式 git@host:user/repo
    if (last.includes(':')) {
      return last.split(':').pop() || 'repo';
    }
    return last || 'repo';
  }

  /**
   * 获取用户主目录（跨平台近似）
   */
  function getUserHomeDir() {
    // 浏览器端无法获取真实 home 目录，返回合理的默认值
    return '~/git';
  }

  /* ==================== 工具函数 ==================== */

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { id, name, icon, init, cleanup };
})();

// 挂载到全局
window.cloneModule = cloneModule;
