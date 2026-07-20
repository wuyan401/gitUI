/* ============================================================
   remote.js — 远程仓库操作面板
   导出：{ id:'remote', name:'远程', icon:'☁️', init(container), cleanup() }
   功能：远程列表、添加/推送/拉取/获取、操作日志
   ============================================================ */

const remoteModule = (() => {
  const id = 'remote';
  const name = '远程';
  const icon = '☁️';

  /** 当前是否活跃 */
  let active = false;
  /** 当前容器引用 */
  let containerEl = null;
  /** 操作日志 */
  let operationLogs = [];

  /**
   * 初始化
   */
  async function init(container) {
    active = true;
    containerEl = container;
    const repo = window.state && window.state.currentRepo;

    if (!repo) {
      renderNoRepo(container);
      return;
    }

    operationLogs = [];
    renderSkeleton(container);
    await loadRemotes(container, repo);
    await loadBranches(container, repo);

    // 监听仓库变化
    window.eventBus.on('repo-changed', handleRepoChange);
  }

  function cleanup() {
    active = false;
    containerEl = null;
  }

  function handleRepoChange(repo) {
    if (!active || !containerEl) return;
    operationLogs = [];
    if (repo) {
      renderSkeleton(containerEl);
      loadRemotes(containerEl, repo);
      loadBranches(containerEl, repo);
    } else {
      renderNoRepo(containerEl);
    }
  }

  /* ==================== 渲染 ==================== */

  function renderNoRepo(container) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">☁️</div>
        <p>请先打开一个仓库以管理远程仓库</p>
      </div>`;
  }

  function renderSkeleton(container) {
    container.innerHTML = `
      <div class="toolbar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;">
        <h2 style="font-size:18px;font-weight:700;color:var(--text);">☁️ 远程仓库</h2>
        <button class="btn btn-sm" id="btn-refresh-remote">🔄 刷新</button>
      </div>

      <!-- 远程仓库列表 -->
      <div class="card" style="margin-bottom:20px;">
        <div class="section-title">📡 已配置的远程仓库</div>
        <div id="remote-list">
          <div class="spinner"></div>
        </div>
      </div>

      <!-- 添加远程仓库 -->
      <div class="card" style="margin-bottom:20px;">
        <div class="section-title">➕ 添加远程仓库</div>
        <form id="add-remote-form" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:150px;">
            <label style="font-size:12px;color:var(--text-secondary);">名称</label>
            <input type="text" class="input" id="remote-name-input" placeholder="如 origin" style="margin-top:4px;">
          </div>
          <div style="flex:2;min-width:250px;">
            <label style="font-size:12px;color:var(--text-secondary);">URL</label>
            <input type="text" class="input" id="remote-url-input" placeholder="如 https://github.com/user/repo.git" style="margin-top:4px;">
          </div>
          <button type="submit" class="btn btn-primary" style="flex-shrink:0;">添加</button>
        </form>
      </div>

      <!-- 远程操作 -->
      <div class="card" style="margin-bottom:20px;">
        <div class="section-title">🚀 远程操作</div>
        <div id="remote-operations">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
            <!-- 推送 -->
            <div style="flex:1;min-width:200px;">
              <label style="font-size:12px;color:var(--text-secondary);">推送 (Push)</label>
              <div style="display:flex;gap:4px;align-items:center;margin-top:4px;">
                <select class="input" id="push-remote-select" style="width:auto;flex:1;"></select>
                <select class="input" id="push-branch-select" style="width:auto;flex:1;"></select>
              </div>
              <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
                <label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" id="force-push-checkbox"> Force Push
                </label>
                <button class="btn btn-sm btn-primary" id="btn-push">📤 推送</button>
              </div>
            </div>

            <!-- 拉取 -->
            <div style="flex:1;min-width:200px;">
              <label style="font-size:12px;color:var(--text-secondary);">拉取 (Pull)</label>
              <div style="display:flex;gap:4px;align-items:center;margin-top:4px;">
                <select class="input" id="pull-remote-select" style="width:auto;flex:1;"></select>
                <select class="input" id="pull-branch-select" style="width:auto;flex:1;"></select>
              </div>
              <div style="margin-top:6px;">
                <button class="btn btn-sm" id="btn-pull">📥 拉取</button>
              </div>
            </div>

            <!-- 获取 -->
            <div style="flex-shrink:0;min-width:120px;">
              <label style="font-size:12px;color:var(--text-secondary);">获取 (Fetch)</label>
              <div style="margin-top:4px;">
                <select class="input" id="fetch-remote-select" style="width:auto;"></select>
              </div>
              <div style="margin-top:6px;">
                <button class="btn btn-sm" id="btn-fetch">📡 获取</button>
              </div>
            </div>
          </div>
        </div>
        <!-- 进度指示器 -->
        <div id="remote-progress" style="margin-top:12px;display:none;align-items:center;gap:8px;">
          <div class="spinner" style="margin:0;width:16px;height:16px;border-width:2px;"></div>
          <span id="remote-progress-text" style="font-size:12px;color:var(--text-secondary);">操作进行中...</span>
        </div>
      </div>

      <!-- 操作日志 -->
      <div class="card">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>📋 操作日志</span>
          <button class="btn btn-sm" id="btn-clear-logs">清空</button>
        </div>
        <div id="remote-log">
          <p style="font-size:12px;color:var(--text-secondary);">暂无操作记录</p>
        </div>
      </div>`;

    // 绑定事件
    bindEvents(container);
  }

  /**
   * 绑定所有 UI 事件
   */
  function bindEvents(container) {
    // 刷新
    container.querySelector('#btn-refresh-remote').addEventListener('click', async () => {
      const repo = window.state && window.state.currentRepo;
      if (repo && active) {
        await loadRemotes(container, repo);
      }
    });

    // 添加远程仓库表单
    container.querySelector('#add-remote-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = container.querySelector('#remote-name-input');
      const urlInput = container.querySelector('#remote-url-input');
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();

      if (!name || !url) {
        window.toast('请填写名称和 URL', 'error');
        return;
      }

      const repo = window.state && window.state.currentRepo;
      if (!repo) return;

      const result = await window.api.post(`/api/repos/${repo.id}/remote/add`, { name, url });
      if (result.success) {
        window.toast(`远程仓库 ${name} 已添加`, 'success');
        addLog('success', `已添加远程仓库: ${name} → ${url}`);
        nameInput.value = '';
        urlInput.value = '';
        await loadRemotes(container, repo);
      } else {
        window.toast(result.error || '添加失败', 'error');
        addLog('error', `添加远程仓库失败: ${result.error}`);
      }
    });

    // 推送
    container.querySelector('#btn-push').addEventListener('click', async () => {
      await doPush(container);
    });

    // 拉取
    container.querySelector('#btn-pull').addEventListener('click', async () => {
      await doPull(container);
    });

    // 获取
    container.querySelector('#btn-fetch').addEventListener('click', async () => {
      await doFetch(container);
    });

    // 清空日志
    container.querySelector('#btn-clear-logs').addEventListener('click', () => {
      operationLogs = [];
      renderLogs(container);
    });
  }

  /**
   * 加载远程仓库列表
   */
  async function loadRemotes(container, repo) {
    const listEl = container.querySelector('#remote-list');
    if (!listEl) return;

    const result = await window.api.get(`/api/repos/${repo.id}/remote`);

    if (!result.success) {
      listEl.innerHTML = `<div class="empty-state"><p>⚠️ 加载失败: ${escapeHtml(result.error)}</p></div>`;
      return;
    }

    const remotes = result.data || [];

    // 更新选择框
    updateSelectOptions(container, remotes);

    if (remotes.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📡</div><p>暂无远程仓库，请添加一个</p></div>';
    } else {
      listEl.innerHTML = remotes.map(r => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-weight:600;color:var(--text);font-family:ui-monospace,monospace;font-size:13px;">${escapeHtml(r.name)}</span>
            <span style="font-size:12px;color:var(--text-secondary);font-family:ui-monospace,monospace;">${escapeHtml(r.url || r.fetch || '-')}</span>
          </div>
          <button class="btn btn-sm btn-danger btn-remove-remote" data-name="${escapeHtml(r.name)}">移除</button>
        </div>
      `).join('');

      // 绑定移除按钮
      listEl.querySelectorAll('.btn-remove-remote').forEach(btn => {
        btn.addEventListener('click', async () => {
          await removeRemote(container, repo, btn.dataset.name);
        });
      });
    }
  }

  /**
   * 加载分支列表填充选择框
   */
  async function loadBranches(container, repo) {
    const result = await window.api.get(`/api/repos/${repo.id}/branches`);
    if (!result.success) return;

    const localBranches = (result.data && result.data.local) || [];

    const branchOpts = localBranches.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');

    // 更新所有分支选择框
    const pushBranch = container.querySelector('#push-branch-select');
    const pullBranch = container.querySelector('#pull-branch-select');
    if (pushBranch) pushBranch.innerHTML = branchOpts;
    if (pullBranch) pullBranch.innerHTML = branchOpts;
  }

  /**
   * 更新下拉框选项
   */
  function updateSelectOptions(container, remotes) {
    const remoteOpts = remotes.map(r => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`).join('');

    const selects = ['#push-remote-select', '#pull-remote-select', '#fetch-remote-select'];
    selects.forEach(sel => {
      const el = container.querySelector(sel);
      if (el) el.innerHTML = remoteOpts;
    });
  }

  /**
   * 移除远程仓库
   */
  async function removeRemote(container, repo, remoteName) {
    const confirmed = await window.confirm(
      '移除远程仓库',
      `确认移除远程仓库 "${remoteName}"？此操作不可撤销。`
    );
    if (!confirmed) return;

    // 使用 fetch 直接发送 DELETE
    try {
      const res = await fetch(`/api/repos/${repo.id}/remote`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: remoteName }),
      });
      const result = await res.json();

      if (result.success) {
        window.toast(`远程仓库 ${remoteName} 已移除`, 'success');
        addLog('success', `已移除远程仓库: ${remoteName}`);
        await loadRemotes(container, repo);
      } else {
        window.toast(result.error || '移除失败', 'error');
        addLog('error', `移除远程仓库失败: ${result.error}`);
      }
    } catch (e) {
      window.toast('移除远程仓库失败: ' + e.message, 'error');
    }
  }

  /* ==================== 远程操作 ==================== */

  function showProgress(container, text) {
    const progressEl = container.querySelector('#remote-progress');
    const textEl = container.querySelector('#remote-progress-text');
    if (progressEl) progressEl.style.display = 'flex';
    if (textEl) textEl.textContent = text;
  }

  function hideProgress(container) {
    const progressEl = container.querySelector('#remote-progress');
    if (progressEl) progressEl.style.display = 'none';
  }

  async function doPush(container) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    const remote = container.querySelector('#push-remote-select').value;
    const branch = container.querySelector('#push-branch-select').value;
    const force = container.querySelector('#force-push-checkbox').checked;

    if (!remote || !branch) {
      window.toast('请选择远程仓库和分支', 'error');
      return;
    }

    const action = force ? `强制推送 ${branch} 到 ${remote}` : `推送 ${branch} 到 ${remote}`;
    if (force) {
      const confirmed = await window.confirm('强制推送', `确认强制推送？这可能覆盖远程历史！`);
      if (!confirmed) return;
    }

    showProgress(container, `正在${action}...`);
    addLog('info', `开始${action}`);

    const result = await window.api.post(`/api/repos/${repo.id}/remote/push`, {
      remote,
      branch,
      force,
    });

    hideProgress(container);

    if (result.success) {
      window.toast(action + ' 成功', 'success');
      addLog('success', `${action} — 完成`);
    } else {
      window.toast(result.error || '推送失败', 'error');
      addLog('error', `${action} — 失败: ${result.error}`);
    }
  }

  async function doPull(container) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    const remote = container.querySelector('#pull-remote-select').value;
    const branch = container.querySelector('#pull-branch-select').value;

    if (!remote || !branch) {
      window.toast('请选择远程仓库和分支', 'error');
      return;
    }

    showProgress(container, `正在从 ${remote}/${branch} 拉取...`);
    addLog('info', `开始拉取 ${remote}/${branch}`);

    const result = await window.api.post(`/api/repos/${repo.id}/remote/pull`, {
      remote,
      branch,
    });

    hideProgress(container);

    if (result.success) {
      window.toast(`拉取 ${remote}/${branch} 成功`, 'success');
      addLog('success', `拉取 ${remote}/${branch} — 完成`);
      // 拉取后可能改变仓库状态，触发刷新
      window.eventBus.emit('repo-changed', repo);
    } else {
      window.toast(result.error || '拉取失败', 'error');
      addLog('error', `拉取 ${remote}/${branch} — 失败: ${result.error}`);
    }
  }

  async function doFetch(container) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    const remote = container.querySelector('#fetch-remote-select').value;
    if (!remote) {
      window.toast('请选择远程仓库', 'error');
      return;
    }

    showProgress(container, `正在从 ${remote} 获取...`);
    addLog('info', `开始获取 ${remote}`);

    const result = await window.api.post(`/api/repos/${repo.id}/remote/fetch`, {
      remote,
    });

    hideProgress(container);

    if (result.success) {
      window.toast(`获取 ${remote} 成功`, 'success');
      addLog('success', `获取 ${remote} — 完成`);
    } else {
      window.toast(result.error || '获取失败', 'error');
      addLog('error', `获取 ${remote} — 失败: ${result.error}`);
    }
  }

  /* ==================== 操作日志 ==================== */

  function addLog(type, message) {
    operationLogs.unshift({
      type, // 'success' | 'error' | 'info'
      message,
      time: new Date().toLocaleTimeString('zh-CN'),
    });
    // 最多保留 50 条
    if (operationLogs.length > 50) operationLogs.pop();

    renderLogs(containerEl);
  }

  function renderLogs(container) {
    if (!container) return;
    const logEl = container.querySelector('#remote-log');
    if (!logEl) return;

    if (operationLogs.length === 0) {
      logEl.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);">暂无操作记录</p>';
      return;
    }

    const iconMap = { success: '✅', error: '❌', info: 'ℹ️' };
    const colorMap = { success: '#27ae60', error: '#e74c3c', info: 'var(--text-secondary)' };

    logEl.innerHTML = operationLogs.map(log => `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span style="flex-shrink:0;">${iconMap[log.type] || 'ℹ️'}</span>
        <span style="flex:1;color:${colorMap[log.type] || 'var(--text-secondary)'};">${escapeHtml(log.message)}</span>
        <span style="flex-shrink:0;color:var(--text-secondary);opacity:0.6;">${log.time}</span>
      </div>
    `).join('');
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
window.remoteModule = remoteModule;
