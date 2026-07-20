/* ============================================================
   settings.js — 设置面板
   导出：{ id:'settings', name:'设置', icon:'⚙', init(container), cleanup() }
   功能：主题切换、git 用户信息、默认克隆路径、关于信息
   ============================================================ */

const settingsModule = (() => {
  const id = 'settings';
  const name = '设置';
  const icon = '⚙';

  /** 当前是否活跃 */
  let active = false;
  /** 当前容器引用 */
  let containerEl = null;

  /**
   * 初始化
   */
  async function init(container) {
    active = true;
    containerEl = container;

    renderPanel(container);
    bindEvents(container);
    await loadGitUserInfo(container);
  }

  function cleanup() {
    active = false;
    containerEl = null;
  }

  /* ==================== 渲染 ==================== */

  function renderPanel(container) {
    const currentTheme = localStorage.getItem('gitui-theme') || 'light';
    const defaultClonePath = localStorage.getItem('gitui-default-clone-path') || '~/git';
    const savedRepos = getSavedRepos();

    container.innerHTML = `
      <div style="max-width:640px;margin:0 auto;">
        <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:20px;">⚙ 设置</h2>

        <!-- 主题设置 -->
        <div class="card" style="margin-bottom:16px;">
          <div class="section-title">🎨 主题设置</div>
          <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text);">深色模式</div>
              <div style="font-size:11px;color:var(--text-secondary);">切换亮色/暗色主题</div>
            </div>
            <div style="position:relative;">
              <input type="checkbox" id="settings-dark-mode" style="display:none;" ${currentTheme === 'dark' ? 'checked' : ''}>
              <label for="settings-dark-mode" class="toggle-switch" style="
                display:block;width:44px;height:24px;background:${currentTheme === 'dark' ? 'var(--accent)' : 'var(--border)'};
                border-radius:12px;position:relative;transition:background 0.2s ease;
              ">
                <span style="
                  position:absolute;top:2px;left:${currentTheme === 'dark' ? '22px' : '2px'};
                  width:20px;height:20px;background:#fff;border-radius:50%;
                  transition:left 0.2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.2);
                "></span>
              </label>
            </div>
          </label>
        </div>

        <!-- Git 用户信息 -->
        <div class="card" style="margin-bottom:16px;">
          <div class="section-title">👤 Git 用户信息</div>
          <p style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">
            设置全局 Git 用户名和邮箱，用于提交记录
          </p>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:500;color:var(--text);margin-bottom:4px;">
              用户名 (user.name)
            </label>
            <input type="text" class="input" id="settings-git-name" placeholder="如: Zhang San"
              style="font-family:ui-monospace,monospace;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:500;color:var(--text);margin-bottom:4px;">
              邮箱 (user.email)
            </label>
            <input type="email" class="input" id="settings-git-email" placeholder="如: zhang@example.com"
              style="font-family:ui-monospace,monospace;">
          </div>
          <button class="btn btn-primary btn-sm" id="btn-save-git-user">💾 保存 Git 用户信息</button>
          <span id="settings-git-user-status" style="margin-left:8px;font-size:12px;color:var(--text-secondary);"></span>
        </div>

        <!-- 默认克隆路径 -->
        <div class="card" style="margin-bottom:16px;">
          <div class="section-title">📂 默认克隆路径</div>
          <p style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">
            克隆远程仓库时的默认本地目录
          </p>
          <div style="display:flex;gap:8px;">
            <input type="text" class="input" id="settings-clone-path" value="${escapeHtml(defaultClonePath)}"
              style="font-family:ui-monospace,monospace;flex:1;">
            <button class="btn btn-sm" id="btn-save-clone-path">💾 保存</button>
          </div>
        </div>

        <!-- 数据管理 -->
        <div class="card" style="margin-bottom:16px;">
          <div class="section-title">🗂 数据管理</div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:13px;color:var(--text);">已保存的仓库</div>
              <div style="font-size:11px;color:var(--text-secondary);">${savedRepos.length > 0 ? `已保存 ${savedRepos.length} 个仓库` : '暂无已保存的仓库'}</div>
            </div>
            <button class="btn btn-danger btn-sm" id="btn-clear-repos" ${savedRepos.length === 0 ? 'disabled' : ''}>
              🗑 清除列表
            </button>
          </div>
        </div>

        <!-- 关于 -->
        <div class="card" style="margin-bottom:16px;">
          <div class="section-title">ℹ️ 关于 GitUI</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:12px;color:var(--text-secondary);">
            <span style="color:var(--text);font-weight:500;">版本</span>
            <span>v1.0.0</span>
            <span style="color:var(--text);font-weight:500;">技术栈</span>
            <span>Node.js + Express + 原生 HTML/CSS/JS</span>
            <span style="color:var(--text);font-weight:500;">Git 集成</span>
            <span>通过 child_process 调用系统 Git 命令</span>
            <span style="color:var(--text);font-weight:500;">特性</span>
            <span>可视化分支管理 · 提交历史 · Diff 查看 · 远程操作 · 克隆仓库</span>
          </div>
        </div>
      </div>`;
  }

  function bindEvents(container) {
    // 主题切换
    const darkModeCheckbox = container.querySelector('#settings-dark-mode');
    if (darkModeCheckbox) {
      darkModeCheckbox.addEventListener('change', () => {
        const theme = darkModeCheckbox.checked ? 'dark' : 'light';
        applyTheme(theme);
        // 更新开关样式
        updateToggleSwitch(container, theme);
      });
    }

    // 保存 Git 用户信息
    const saveGitBtn = container.querySelector('#btn-save-git-user');
    if (saveGitBtn) {
      saveGitBtn.addEventListener('click', () => saveGitUserInfo(container));
    }

    // 保存默认克隆路径
    const saveClonePathBtn = container.querySelector('#btn-save-clone-path');
    if (saveClonePathBtn) {
      saveClonePathBtn.addEventListener('click', () => {
        const input = container.querySelector('#settings-clone-path');
        if (input) {
          const path = input.value.trim();
          localStorage.setItem('gitui-default-clone-path', path || '~/git');
          window.toast('默认克隆路径已保存', 'success');
        }
      });
    }

    // 清除已保存仓库
    const clearReposBtn = container.querySelector('#btn-clear-repos');
    if (clearReposBtn) {
      clearReposBtn.addEventListener('click', async () => {
        const confirmed = await window.confirm(
          '清除已保存仓库',
          '确认清除已保存的仓库列表？此操作不会删除实际的 Git 仓库文件。'
        );
        if (confirmed) {
          clearSavedRepos();
          window.toast('已保存的仓库列表已清除', 'success');
          // 刷新面板
          renderPanel(container);
          bindEvents(container);
          loadGitUserInfo(container);
        }
      });
    }
  }

  function updateToggleSwitch(container, theme) {
    const label = container.querySelector('label[for="settings-dark-mode"]');
    const span = label && label.querySelector('span');
    if (label) {
      label.style.background = theme === 'dark' ? 'var(--accent)' : 'var(--border)';
    }
    if (span) {
      span.style.left = theme === 'dark' ? '22px' : '2px';
    }
  }

  /* ==================== 主题 ==================== */

  function applyTheme(theme) {
    localStorage.setItem('gitui-theme', theme);

    // 使用全局 themeManager 切换
    if (window.themeManager) {
      window.themeManager.setTheme(theme);
    } else {
      // 兜底：直接操作 CSS
      const lightLink = document.getElementById('theme-light');
      const darkLink = document.getElementById('theme-dark');
      if (lightLink) lightLink.disabled = theme === 'dark';
      if (darkLink) darkLink.disabled = theme === 'light';
    }
  }

  /* ==================== Git 用户信息 ==================== */

  async function loadGitUserInfo(container) {
    const nameInput = container.querySelector('#settings-git-name');
    const emailInput = container.querySelector('#settings-git-email');

    if (!nameInput || !emailInput) return;

    // 先从 localStorage 加载
    const savedName = localStorage.getItem('gitui-git-user-name');
    const savedEmail = localStorage.getItem('gitui-git-user-email');

    if (savedName) nameInput.value = savedName;
    if (savedEmail) emailInput.value = savedEmail;

    // 尝试从当前仓库获取 git config（如果有打开仓库）
    const repo = window.state && window.state.currentRepo;
    if (repo) {
      try {
        const nameResult = await window.api.get(`/api/repos/${repo.id}/config?key=user.name`);
        const emailResult = await window.api.get(`/api/repos/${repo.id}/config?key=user.email`);

        if (nameResult.success && nameResult.data && !savedName) {
          nameInput.value = nameResult.data;
        }
        if (emailResult.success && emailResult.data && !savedEmail) {
          emailInput.value = emailResult.data;
        }
      } catch (e) {
        // 忽略获取 git config 失败
      }
    }
  }

  async function saveGitUserInfo(container) {
    const nameInput = container.querySelector('#settings-git-name');
    const emailInput = container.querySelector('#settings-git-email');
    const statusEl = container.querySelector('#settings-git-user-status');

    const name = (nameInput.value || '').trim();
    const email = (emailInput.value || '').trim();

    if (!name && !email) {
      window.toast('请至少填写用户名或邮箱', 'error');
      return;
    }

    // 保存到 localStorage
    if (name) localStorage.setItem('gitui-git-user-name', name);
    if (email) localStorage.setItem('gitui-git-user-email', email);

    // 尝试通过后端设置全局 git config
    const repo = window.state && window.state.currentRepo;
    if (repo) {
      try {
        if (name) {
          await window.api.post(`/api/repos/${repo.id}/config`, { key: 'user.name', value: name });
        }
        if (email) {
          await window.api.post(`/api/repos/${repo.id}/config`, { key: 'user.email', value: email });
        }
      } catch (e) {
        // 忽略设置失败
      }
    }

    if (statusEl) {
      statusEl.textContent = '✅ 已保存';
      statusEl.style.color = '#27ae60';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    }
    window.toast('Git 用户信息已保存', 'success');
  }

  /* ==================== 仓库列表管理 ==================== */

  function getSavedRepos() {
    try {
      const data = localStorage.getItem('gitui-saved-repos');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function clearSavedRepos() {
    localStorage.removeItem('gitui-saved-repos');
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
window.settingsModule = settingsModule;
