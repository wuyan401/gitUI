/* ============================================================
   app.js — 应用入口
   职责：初始化主题/路由、封装 API、全局状态、事件总线、导航事件
   ============================================================ */

(function () {
  'use strict';

  /* ==================== 全局状态 ==================== */
  window.state = {
    /** @type {{ id: string, name: string, path: string, branch: string } | null} */
    currentRepo: null,
    /** @type {Array<{ id: string, name: string, path: string }>} */
    repos: [],
  };

  /* ==================== 事件总线 ==================== */
  const listeners = {};

  /**
   * 订阅事件
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  }

  /**
   * 发布事件
   * @param {string} event - 事件名
   * @param {*} data - 事件数据
   */
  function emit(event, data) {
    (listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error('事件处理失败:', event, e); }
    });
  }

  window.eventBus = { on, emit };

  /* ==================== API 封装 ==================== */
  const API_BASE = window.location.origin;

  /**
   * GET 请求
   * @param {string} url - 请求路径（不含 origin）
   * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
   */
  async function get(url) {
    try {
      const res = await fetch(API_BASE + url);
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || '网络请求失败' };
    }
  }

  /**
   * POST 请求
   * @param {string} url - 请求路径
   * @param {object} data - 请求体数据
   * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
   */
  async function post(url, data) {
    try {
      const res = await fetch(API_BASE + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || '网络请求失败' };
    }
  }

  // 挂载到全局
  window.api = { get, post };

  /* ==================== 对话框工具 ==================== */
  /**
   * 显示确认对话框
   * @param {string} title
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  function confirm(title, message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.innerHTML = `
        <div class="dialog">
          <div class="dialog-title">${title}</div>
          <div class="dialog-message">${message}</div>
          <div class="dialog-actions">
            <button class="btn btn-cancel" id="dialog-cancel">取消</button>
            <button class="btn btn-primary" id="dialog-ok">确认</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('#dialog-ok').onclick = () => {
        overlay.remove();
        resolve(true);
      };
      overlay.querySelector('#dialog-cancel').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      overlay.onclick = (e) => {
        if (e.target === overlay) { overlay.remove(); resolve(false); }
      };
    });
  }

  window.confirm = confirm;

  /* ==================== Toast 消息 ==================== */
  /**
   * 显示提示消息
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration - 自动消失时间(ms)，默认 3000
   */
  function toast(message, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  window.toast = toast;

  /* ==================== 打开仓库对话框 ==================== */
  async function openRepoDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-title">打开仓库</div>
        <form id="open-repo-form">
          <input type="text" class="input" id="repo-path-input" placeholder="输入本地仓库路径，如 /home/user/my-project" style="width:100%" autofocus>
          <div class="dialog-actions" style="margin-top:16px">
            <button type="button" class="btn" id="dialog-cancel">取消</button>
            <button type="submit" class="btn btn-primary">打开</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    return new Promise((resolve) => {
      overlay.querySelector('#dialog-cancel').onclick = () => {
        overlay.remove();
        resolve(null);
      };
      overlay.onclick = (e) => {
        if (e.target === overlay) { overlay.remove(); resolve(null); }
      };
      overlay.querySelector('#open-repo-form').onsubmit = async (e) => {
        e.preventDefault();
        const path = overlay.querySelector('#repo-path-input').value.trim();
        if (!path) return;
        overlay.remove();
        resolve(path);
      };
    });
  }

  /* ==================== 仓库切换器 ==================== */

  function updateRepoSwitcher() {
    const sw = document.getElementById('repo-switcher');
    const sel = document.getElementById('repo-select');
    if (!sw || !sel) return;

    if (state.repos.length === 0) { sw.style.display = 'none'; return; }
    sw.style.display = 'flex';

    sel.innerHTML = state.repos.map(r =>
      `<option value="${r.id}" ${state.currentRepo && r.id === state.currentRepo.id ? 'selected' : ''}>📁 ${escapeHtml(r.name)}</option>`
    ).join('');

    // 加载远程仓库列表
    loadRemotesForSwitcher();
  }

  async function loadRemotesForSwitcher() {
    const sel = document.getElementById('remote-select');
    if (!sel || !state.currentRepo) return;
    const r = await api.get(`/api/repos/${state.currentRepo.id}/remote`);
    if (!r.success || !r.data) { sel.innerHTML = '<option value="">无远程</option>'; return; }
    sel.innerHTML = r.data.map(rm => `<option value="${escapeHtml(rm.name)}">☁ ${escapeHtml(rm.name)}</option>`).join('');
    if (r.data.length === 0) sel.innerHTML = '<option value="">无远程</option>';
  }

  function getSelectedRemote() {
    const sel = document.getElementById('remote-select');
    return sel ? sel.value || 'origin' : 'origin';
  }

  async function switchToRepo(repoId) {
    if (!repoId) return;
    const result = await api.get('/api/repos');
    if (!result.success) return;
    const repos = result.data || [];
    const target = repos.find(r => r.id === repoId);
    if (!target) return;
    state.currentRepo = target;
    state.repos = repos;
    updateRepoSwitcher();
    eventBus.emit('repo-changed', target);
    toast(`已切换到 ${target.name}`, 'info');
  }

  async function quickPull() {
    const repo = state.currentRepo;
    if (!repo) return toast('请先打开仓库', 'error');
    const remote = getSelectedRemote();
    toast(`正在从 ${remote} 拉取…`, 'info');
    const r = await api.post(`/api/repos/${repo.id}/remote/pull`, { remote });
    if (r.success) {
      const detail = (r.data?.detail || '');
      if (detail.includes('Already up to date') || detail.includes('已经是最新')) {
        toast(`远程 ${remote} 没有新变更`, 'info');
      } else if (detail.includes('Fast-forward') || detail.includes('Updating')) {
        toast('拉取成功，已快进合并', 'success');
      } else if (detail.includes('Merge made')) {
        toast('拉取成功，已自动合并', 'success');
      } else {
        toast('拉取完成', 'success');
      }
      eventBus.emit('repo-changed', repo);
    } else {
      toast(r.error || '拉取失败', 'error');
    }
  }

  async function quickPush() {
    const repo = state.currentRepo;
    if (!repo) return toast('请先打开仓库', 'error');
    const remote = getSelectedRemote();
    toast(`正在推送到 ${remote}…`, 'info');
    const r = await api.post(`/api/repos/${repo.id}/remote/push`, { remote });
    if (r.success) {
      toast('推送完成', 'success');
    } else {
      toast(r.error || '推送失败', 'error');
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /* ==================== 初始化 ==================== */
  async function init() {
    // 1. 初始化主题
    window.themeManager.init();

    // 2. 注册面板模块
    if (window.dashboardModule) {
      window.router.register(window.dashboardModule);
    }
    if (window.branchesModule) {
      window.router.register(window.branchesModule);
    }
    if (window.historyModule) {
      window.router.register(window.historyModule);
    }
    if (window.diffModule) {
      window.router.register(window.diffModule);
    }
    if (window.remoteModule) {
      window.router.register(window.remoteModule);
    }
    if (window.cloneModule) {
      window.router.register(window.cloneModule);
    }
    if (window.settingsModule) {
      window.router.register(window.settingsModule);
    }

    // 3. 绑定导航栏事件
    bindNavEvents();

    // 4. 尝试恢复已打开的仓库列表
    const reposResult = await api.get('/api/repos');
    if (reposResult.success && reposResult.data) {
      state.repos = reposResult.data;
      if (state.repos.length > 0 && !state.currentRepo) {
        state.currentRepo = state.repos[0];
      }
      updateRepoSwitcher();
    }

    // 5. 监听仓库变化事件
    eventBus.on('repo-changed', (repo) => {
      state.currentRepo = repo;
      updateRepoSwitcher();
      window.router.route(window.location.hash.slice(1) || 'dashboard');
    });

    // 6. 启动路由
    window.router.init();
  }

  function bindNavEvents() {
    // 主题切换
    document.getElementById('btn-theme').addEventListener('click', () => {
      window.themeManager.toggleTheme();
    });

    // 打开仓库
    document.getElementById('btn-open-repo').addEventListener('click', async () => {
      const path = await openRepoDialog();
      if (!path) return;

      const result = await api.post('/api/repos/open', { path });
      if (result.success && result.data) {
        // 去重：同路径不重复添加
        const existing = state.repos.find(r => r.path === result.data.path);
        if (!existing) state.repos.push(result.data);
        state.currentRepo = result.data;
        updateRepoSwitcher();
        eventBus.emit('repo-changed', result.data);
        toast('仓库已打开', 'success');
      } else {
        toast(result.error || '打开仓库失败', 'error');
      }
    });

    // 仓库切换下拉框
    const repoSelect = document.getElementById('repo-select');
    if (repoSelect) {
      repoSelect.addEventListener('change', () => switchToRepo(repoSelect.value));
    }

    // 快捷拉取
    const btnPull = document.getElementById('btn-quick-pull');
    if (btnPull) btnPull.addEventListener('click', quickPull);

    // 快捷推送
    const btnPush = document.getElementById('btn-quick-push');
    if (btnPush) btnPush.addEventListener('click', quickPush);

    // 设置
    document.getElementById('btn-settings').addEventListener('click', () => {
      window.location.hash = '#settings';
    });

    // 帮助
    document.getElementById('btn-help').addEventListener('click', showHelp);
  }

  /* ==================== 帮助面板 ==================== */

  function showHelp() {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.style.overflow = 'auto';
    ov.innerHTML = `<div class="dialog" style="max-width:700px;max-height:85vh;overflow-y:auto;">
      <div class="dialog-title">📖 GitUI 使用指南</div>

      <div style="font-size:13px;line-height:1.8;color:var(--text);">

        <h3 style="margin:16px 0 8px;color:var(--accent);">🚀 快速开始</h3>
        <p>点击右上角 <b>📂</b> 打开本地仓库，或从左侧 <b>📥 克隆</b> 面板输入远程 URL 克隆仓库。</p>
        <p>打开仓库后，导航栏会出现 <b>仓库切换下拉框</b> 和 <b>远程选择器</b>，可快速切换项目。</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">📋 仪表盘（🏠 概览）</h3>
        <p>仓库信息卡片 + <b>工作区状态</b>（已暂存/已修改/未跟踪）+ 快速提交。</p>
        <p>每个文件可单独 <b>暂存/取消暂存/删除</b>。有变更时底部出现提交区域：</p>
        <p style="padding-left:16px;">💾 <b>提交到本地</b> — 仅本地 Git 提交<br>
        🚀 <b>提交并推送</b> — 提交后自动推送到选中的远程仓库<br>
        ⌨ <b>Ctrl+Enter</b> — 等同于"提交并推送"</p>
        <p>如果 Git 未配置身份信息，提交时会自动弹出配置对话框。</p>
        <p>📥 <b>从远程恢复</b> — 用远程仓库的文件覆盖本地工作区。</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">🌿 分支管理</h3>
        <p>本地/远程分支列表，支持 <b>切换/创建/合并/删除</b> 分支。</p>
        <p>当前分支标注 ✓，删除当前分支会被阻止。</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">📜 提交历史</h3>
        <p>Canvas 绘制的 <b>分支图</b> + 时间线提交列表。分页加载，点击展开详情。</p>
        <p>每条提交右侧有操作按钮：</p>
        <p style="padding-left:16px;">↩ <b>回滚</b> — git revert，安全，创建反向提交保留历史<br>
        ⟲ <b>重置</b> — git reset，支持 Soft/Mixed/Hard 三种模式</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">📊 差异对比</h3>
        <p>左侧文件列表 + 右侧 <b>GitHub 风格 Diff 高亮</b>（绿增红删）。</p>
        <p>支持查看 <b>工作区变更</b> 和 <b>暂存区变更</b>。</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">☁️ 远程仓库</h3>
        <p>管理远程仓库：<b>添加/删除/推送/拉取/获取</b>，底部操作日志。</p>
        <p>导航栏的快捷拉取/推送使用当前选中的远程仓库。</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">⌨ 快捷键</h3>
        <p style="padding-left:16px;"><kbd>Ctrl+Enter</kbd> — 提交并推送<br>
        <kbd>Ctrl+O</kbd> — 打开仓库对话框</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">🔀 导航栏</h3>
        <p>🌓 主题切换（亮色/暗色）&nbsp; 📂 打开仓库 &nbsp; ⚙ 设置 &nbsp; ❓ 帮助</p>
        <p>打开仓库后显示 <b>仓库下拉框</b> 和 <b>远程选择器</b> + ↧拉取 ↥推送。</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">⚙ 设置面板</h3>
        <p>主题切换 / Git 用户名邮箱配置 / 默认克隆路径 / 清除仓库列表 / 关于信息。</p>

        <h3 style="margin:16px 0 8px;color:var(--accent);">💡 常见问题</h3>
        <p><b>拉取后文件没变化？</b> — 拉取只下载远程的新变更，远程没更新就不会变。文件丢了用 <b>📥 从远程恢复</b>。</p>
        <p><b>推送报权限错误？</b> — 需要先在 GitHub 等平台配置 SSH Key 或 Personal Access Token。</p>
        <p><b>克隆报路径错误？</b> — 确认目标目录的父目录存在且路径格式正确。</p>

      </div>
      <div class="dialog-actions" style="margin-top:16px;">
        <button class="btn btn-primary" id="help-close">我知道了</button>
      </div></div>`;
    document.body.appendChild(ov);

    const close = () => ov.remove();
    ov.querySelector('#help-close').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };
  }

  // DOM 加载完成后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
