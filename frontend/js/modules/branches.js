/* ============================================================
   branches.js — 分支管理面板
   导出：{ id:'branches', name:'分支', icon:'🌿', init(container), cleanup() }
   功能：本地/远程分支列表、切换/创建/删除/合并
   ============================================================ */

const branchesModule = (() => {
  const id = 'branches';
  const name = '分支';
  const icon = '🌿';

  /** 当前是否活跃（用于 cleanup 后阻止事件回调） */
  let active = false;
  /** 当前容器引用 */
  let containerEl = null;

  /**
   * 初始化分支管理面板
   * @param {HTMLElement} container
   */
  async function init(container) {
    active = true;
    containerEl = container;
    const repo = window.state && window.state.currentRepo;

    if (!repo) {
      renderNoRepo(container);
      return;
    }

    renderSkeleton(container);
    await loadBranches(container, repo);

    // 监听仓库变化
    window.eventBus.on('repo-changed', handleRepoChange);
  }

  /**
   * 清理
   */
  function cleanup() {
    active = false;
    containerEl = null;
  }

  /* ==================== 事件处理 ==================== */

  function handleRepoChange(repo) {
    if (!active || !containerEl) return;
    if (repo) {
      renderSkeleton(containerEl);
      loadBranches(containerEl, repo);
    } else {
      renderNoRepo(containerEl);
    }
  }

  /* ==================== 渲染 ==================== */

  /** 未打开仓库时的提示 */
  function renderNoRepo(container) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌿</div>
        <p>请先打开一个仓库以管理分支</p>
      </div>`;
  }

  /** 渲染骨架 */
  function renderSkeleton(container) {
    container.innerHTML = `
      <div class="toolbar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;">
        <h2 style="font-size:18px;font-weight:700;color:var(--text);">🌿 分支管理</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" id="btn-refresh-branches">🔄 刷新</button>
          <button class="btn btn-sm btn-primary" id="btn-create-branch">➕ 新建分支</button>
        </div>
      </div>
      <div id="branches-local-section"></div>
      <div id="branches-remote-section" style="margin-top:24px;"></div>`;

    // 绑定按钮事件
    container.querySelector('#btn-refresh-branches').addEventListener('click', async () => {
      const repo = window.state && window.state.currentRepo;
      if (repo && active) await loadBranches(container, repo);
    });

    container.querySelector('#btn-create-branch').addEventListener('click', () => {
      showCreateBranchDialog();
    });
  }

  /**
   * 加载并渲染分支列表
   */
  async function loadBranches(container, repo) {
    const result = await window.api.get(`/api/repos/${repo.id}/branches`);

    const localSection = container.querySelector('#branches-local-section');
    const remoteSection = container.querySelector('#branches-remote-section');

    if (!result.success) {
      if (localSection) {
        localSection.innerHTML = `<div class="empty-state"><p>⚠️ 加载失败: ${escapeHtml(result.error)}</p></div>`;
      }
      if (remoteSection) remoteSection.innerHTML = '';
      return;
    }

    const data = result.data || {};
    const localBranches = data.local || [];
    const remoteBranches = data.remote || [];
    const currentBranch = repo.branch || '';

    if (localSection) {
      renderBranchList(localSection, '📋 本地分支', localBranches, currentBranch, true);
    }
    if (remoteSection) {
      renderBranchList(remoteSection, '☁️ 远程分支', remoteBranches, currentBranch, false);
    }
  }

  /**
   * 渲染分支列表卡片
   */
  function renderBranchList(sectionEl, title, branches, currentBranch, isLocal) {
    // branches 是 [{name, current?}]
    const displayBranches = isLocal
      ? branches.map(b => ({ name: b.name, current: !!b.current, raw: b.name }))
      : branches.map(b => {
          const shortName = b.name.replace(/^origin\//, '');
          return { name: shortName, current: false, raw: b.name };
        });

    sectionEl.innerHTML = `
      <div class="card" style="padding:16px;">
        <div class="section-title">${title} <span class="badge badge-accent">${branches.length}</span></div>
        ${branches.length === 0
          ? '<div class="empty-state" style="padding:20px;"><p>暂无分支</p></div>'
          : `<div class="branch-list">${displayBranches.map(b => {
              const isCurrent = isLocal ? b.current : (b.name === currentBranch);
              return `
                <div class="branch-row" data-branch="${escapeHtml(b.raw)}" style="
                  display:flex;align-items:center;justify-content:space-between;
                  padding:10px 12px;border-bottom:1px solid var(--border);
                  ${isCurrent ? 'background:var(--surface-hover);' : ''}
                ">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="color:var(--accent);font-family:ui-monospace,monospace;font-size:13px;font-weight:500;">
                      ${escapeHtml(b.name)}
                    </span>
                    ${isCurrent ? '<span class="badge badge-success">✓ 当前</span>' : ''}
                  </div>
                  <div style="display:flex;gap:4px;">
                    ${isLocal && !isCurrent
                      ? `<button class="btn btn-sm btn-switch" data-branch="${escapeHtml(b.raw)}">切换</button>`
                      : ''}
                    ${isLocal
                      ? `<button class="btn btn-sm btn-merge" data-branch="${escapeHtml(b.raw)}" ${isCurrent ? 'disabled' : ''}>合并</button>
                         <button class="btn btn-sm btn-danger btn-delete-branch" data-branch="${escapeHtml(b.raw)}" ${isCurrent ? 'disabled' : ''}>删除</button>`
                      : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>`}
      </div>`;

    // 绑定分支操作事件
    bindBranchActions(sectionEl);
  }

  /* ==================== 分支操作 ==================== */

  function bindBranchActions(sectionEl) {
    // 切换分支
    sectionEl.querySelectorAll('.btn-switch').forEach(btn => {
      btn.addEventListener('click', async () => {
        const branchName = btn.dataset.branch;
        await switchBranch(branchName);
      });
    });

    // 合并分支
    sectionEl.querySelectorAll('.btn-merge').forEach(btn => {
      btn.addEventListener('click', async () => {
        const branchName = btn.dataset.branch;
        await mergeBranch(branchName);
      });
    });

    // 删除分支
    sectionEl.querySelectorAll('.btn-delete-branch').forEach(btn => {
      btn.addEventListener('click', async () => {
        const branchName = btn.dataset.branch;
        await deleteBranch(branchName);
      });
    });
  }

  /** 切换分支 */
  async function switchBranch(branchName) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    try {
      const res = await fetch(`/api/repos/${repo.id}/branches/switch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: branchName }),
      });
      const result = await res.json();

      if (result.success) {
        window.toast(`已切换到 ${branchName}`, 'success');
        // 更新当前仓库的分支信息
        repo.branch = branchName;
        window.eventBus.emit('repo-changed', repo);
      } else {
        window.toast(result.error || '切换失败', 'error');
      }
    } catch (e) {
      window.toast('切换分支失败: ' + e.message, 'error');
    }
  }

  /** 合并分支 */
  async function mergeBranch(fromBranch) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    const confirmed = await window.confirm(
      '合并分支',
      `确认将 ${fromBranch} 合并到当前分支 ${repo.branch || '?'}？`
    );
    if (!confirmed) return;

    const result = await window.api.post(`/api/repos/${repo.id}/branches/merge`, { from: fromBranch });
    if (result.success) {
      window.toast(`已合并 ${fromBranch}`, 'success');
      refreshView();
    } else {
      window.toast(result.error || '合并失败', 'error');
    }
  }

  /** 删除分支 */
  async function deleteBranch(branchName) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    const confirmed = await window.confirm(
      '删除分支',
      `确认删除分支 "${branchName}"？此操作不可撤销。`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/repos/${repo.id}/branches`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: branchName }),
      });
      const result = await res.json();

      if (result.success) {
        window.toast(`已删除 ${branchName}`, 'success');
        refreshView();
      } else {
        window.toast(result.error || '删除失败', 'error');
      }
    } catch (e) {
      window.toast('删除分支失败: ' + e.message, 'error');
    }
  }

  /** 新建分支对话框 */
  function showCreateBranchDialog() {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-title">➕ 新建分支</div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-secondary);">分支名称</label>
          <input type="text" class="input" id="new-branch-name" placeholder="输入分支名，如 feature/xxx" style="width:100%;margin-top:4px;" autofocus>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;color:var(--text-secondary);">基于分支（可选，默认为当前分支）</label>
          <input type="text" class="input" id="new-branch-from" placeholder="${escapeHtml(repo.branch || 'main')}" style="width:100%;margin-top:4px;">
        </div>
        <div class="dialog-actions">
          <button class="btn" id="dialog-cancel">取消</button>
          <button class="btn btn-primary" id="dialog-confirm">创建</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector('#new-branch-name');
    const fromInput = overlay.querySelector('#new-branch-from');

    overlay.querySelector('#dialog-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.querySelector('#dialog-confirm').onclick = async () => {
      const branchName = nameInput.value.trim();
      if (!branchName) {
        window.toast('请输入分支名称', 'error');
        return;
      }
      const from = fromInput.value.trim() || undefined;
      overlay.remove();

      const result = await window.api.post(`/api/repos/${repo.id}/branches`, {
        name: branchName,
        from,
      });

      if (result.success) {
        window.toast(`分支 ${branchName} 已创建`, 'success');
        refreshView();
      } else {
        window.toast(result.error || '创建分支失败', 'error');
      }
    };
  }

  /** 刷新当前视图 */
  function refreshView() {
    const repo = window.state && window.state.currentRepo;
    if (!repo || !active || !containerEl) return;
    loadBranches(containerEl, repo);
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
window.branchesModule = branchesModule;
