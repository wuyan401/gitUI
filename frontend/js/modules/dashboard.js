/* ============================================================
   dashboard.js — 仓库概览面板
   导出：{ id:'dashboard', name:'概览', icon:'🏠', init(container) }
   功能：仓库信息、工作区状态、快速暂存提交、最近提交
   ============================================================ */

const dashboardModule = (() => {
  const id = 'dashboard';
  const name = '概览';
  const icon = '🏠';

  let active = false;
  let containerEl = null;

  async function init(container) {
    active = true;
    containerEl = container;
    const repo = window.state && window.state.currentRepo;
    if (!repo) { renderWelcome(container); return; }
    await renderRepoOverview(container, repo);
    window.eventBus.on('repo-changed', (r) => {
      if (!active || !containerEl) return;
      if (r) renderRepoOverview(containerEl, r);
      else renderWelcome(containerEl);
    });
  }

  function cleanup() { active = false; containerEl = null; }

  /* ==================== 欢迎页 ==================== */

  function renderWelcome(container) {
    container.innerHTML = `
      <div class="welcome-page">
        <div class="welcome-icon">🐙</div>
        <h1 class="welcome-title">欢迎使用 GitUI</h1>
        <p class="welcome-desc">可视化 Git 管理工具 — 管理分支、查看历史、比较差异，让 Git 操作更直观高效。</p>
        <div class="welcome-actions">
          <button class="btn btn-primary" id="welcome-open-repo">📂 打开本地仓库</button>
          <button class="btn" id="welcome-init-repo">✨ 初始化新仓库</button>
        </div>
      </div>`;
    container.querySelector('#welcome-open-repo').onclick = () => document.getElementById('btn-open-repo').click();
    container.querySelector('#welcome-init-repo').onclick = async () => {
      const path = await promptPath('初始化新仓库');
      if (!path) return;
      const r = await api.post('/api/repos/init', { path });
      if (r.success && r.data) {
        window.state.currentRepo = r.data;
        window.state.repos.push(r.data);
        window.eventBus.emit('repo-changed', r.data);
        window.toast('仓库已初始化', 'success');
      } else { window.toast(r.error || '初始化失败', 'error'); }
    };
  }

  /* ==================== 仓库概览 ==================== */

  async function renderRepoOverview(container, repo) {
    container.innerHTML = `
      <div class="repo-info-card card">
        <div class="repo-icon">📁</div>
        <div>
          <div class="repo-name">${esc(repo.name || repo.path)}</div>
          <div class="repo-meta"><span>📂 ${esc(repo.path)}</span><span>🌿 ${esc(repo.branch || 'unknown')}</span></div>
        </div>
      </div>

      <!-- 工作区状态 + 快速提交 -->
      <div class="card" style="margin-top:16px;">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>📋 工作区状态</span>
          <button class="btn btn-sm" id="btn-refresh-status">🔄 刷新</button>
        </div>
        <div id="status-area"><div class="spinner"></div></div>
        <div id="commit-area" style="margin-top:12px;display:none;">
          <textarea class="input" id="commit-msg" placeholder="输入提交信息…" rows="2" style="width:100%;resize:vertical;font-family:inherit;"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;">
            <label style="font-size:12px;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" id="chk-push-after" checked> 提交后推送到 origin
            </label>
            <div style="display:flex;gap:8px;">
              <span style="font-size:12px;color:var(--text-secondary);line-height:32px;">Ctrl+Enter</span>
              <button class="btn" id="btn-commit-local">💾 提交到本地</button>
              <button class="btn btn-primary" id="btn-commit-push">🚀 提交并推送</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 最近提交 -->
      <div class="card" style="margin-top:16px;">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>📝 最近提交</span>
          <button class="btn btn-sm" id="btn-restore-remote" title="从远程分支恢复文件">📥 从远程恢复</button>
        </div>
        <div id="recent-commits"><div class="spinner"></div></div>
      </div>`;

    bindStatusEvents(container, repo);
    await loadStatus(container, repo);
    await loadRecentCommits(repo);
  }

  /* ==================== 工作区状态 ==================== */

  function bindStatusEvents(container, repo) {
    container.querySelector('#btn-refresh-status').onclick = () => loadStatus(container, repo);
    container.querySelector('#btn-commit-local').onclick = () => doCommit(container, repo, false);
    container.querySelector('#btn-commit-push').onclick = () => doCommit(container, repo, true);
    container.querySelector('#btn-restore-remote').onclick = () => showRestoreDialog(repo);

    const ta = container.querySelector('#commit-msg');
    if (ta) ta.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); doCommit(container, repo, true); }
    });
  }

  async function loadStatus(container, repo) {
    const area = container.querySelector('#status-area');
    const commitArea = container.querySelector('#commit-area');
    if (!area) return;

    const r = await api.get(`/api/repos/${repo.id}/status`);
    if (!r.success) { area.innerHTML = `<div class="empty-state"><p>⚠️ ${esc(r.error)}</p></div>`; return; }

    const { staged, modified, untracked } = r.data || {};
    const hasChanges = (staged && staged.length > 0) || (modified && modified.length > 0) || (untracked && untracked.length > 0);

    if (!hasChanges) {
      area.innerHTML = '<div class="empty-state" style="padding:16px;"><div class="empty-state-icon">✅</div><p>工作区干净，没有待提交的变更</p></div>';
      if (commitArea) commitArea.style.display = 'none';
      return;
    }

    if (commitArea) commitArea.style.display = 'block';

    let html = '';
    const renderGroup = (title, files, emoji, canStage, actionLabel, canDelete) => {
      if (!files || files.length === 0) return '';
      let rows = files.map(f => {
        const name = f.name || f;
        return `<div class="status-row" style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--border);">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
            <input type="checkbox" class="status-cb" data-file="${esc(name)}" data-action="${actionLabel}">
            <span style="color:var(--text-secondary);">${emoji}</span>
            <span>${esc(name)}</span>
          </label>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm status-btn" data-file="${esc(name)}" data-action="${actionLabel}">${actionLabel}</button>
            ${canDelete ? `<button class="btn btn-sm btn-danger btn-delete-file" data-file="${esc(name)}" title="删除此文件">🗑</button>` : ''}
          </div>
        </div>`;
      }).join('');
      return `<div style="margin-bottom:8px;"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${title} (${files.length})</div>${rows}</div>`;
    };

    html += renderGroup('📦 已暂存', staged, '✅', false, '取消暂存', true);
    html += renderGroup('📝 已修改', modified, '✏️', true, '暂存', true);
    html += renderGroup('❓ 未跟踪', untracked, '➕', true, '暂存', false);

    area.innerHTML = html || '<div class="empty-state"><p>无变更</p></div>';

    // 绑定单个文件暂存/取消暂存
    area.querySelectorAll('.status-btn').forEach(btn => {
      btn.onclick = async () => {
        const file = btn.dataset.file;
        const isStage = btn.dataset.action === '暂存';
        const ep = `/api/repos/${repo.id}/status/${isStage ? 'stage' : 'unstage'}`;
        const res = await api.post(ep, { files: [file] });
        if (res.success) {
          window.toast(`${isStage ? '已暂存' : '已取消暂存'} ${file}`, 'success');
          await loadStatus(container, repo);
        } else {
          window.toast(res.error || '操作失败', 'error');
        }
      };
    });

    // 绑定删除文件按钮
    area.querySelectorAll('.btn-delete-file').forEach(btn => {
      btn.onclick = async () => {
        const file = btn.dataset.file;
        const confirmed = await window.confirm('删除文件', `确认删除 "${file}"？\n文件将被删除并暂存此变更。`);
        if (!confirmed) return;
        const res = await api.post(`/api/repos/${repo.id}/status/delete`, { files: [file] });
        if (res.success) {
          window.toast(`已删除 ${file}`, 'success');
          await loadStatus(container, repo);
        } else {
          window.toast('删除失败: ' + (res.error || ''), 'error');
        }
      };
    });

    // 全选暂存按钮
    if ((modified && modified.length > 0) || (untracked && untracked.length > 0)) {
      const allBtn = document.createElement('button');
      allBtn.className = 'btn btn-sm btn-primary';
      allBtn.textContent = '📦 全部暂存';
      allBtn.style.marginTop = '4px';
      allBtn.onclick = async () => {
        const files = [
          ...(modified || []).map(f => f.name || f),
          ...(untracked || []).map(f => f.name || f)
        ];
        if (files.length === 0) return;
        const res = await api.post(`/api/repos/${repo.id}/status/stage`, { files });
        if (res.success) { window.toast(`已暂存 ${files.length} 个文件`, 'success'); await loadStatus(container, repo); }
        else window.toast(res.error || '暂存失败', 'error');
      };
      area.appendChild(allBtn);
    }
  }

  async function doCommit(container, repo, pushAfter) {
    const msgEl = container.querySelector('#commit-msg');
    const msg = (msgEl.value || '').trim();
    if (!msg) return window.toast('请输入提交信息', 'error');

    const statusR = await api.get(`/api/repos/${repo.id}/status`);
    if (!statusR.success || !statusR.data.staged || statusR.data.staged.length === 0) {
      return window.toast('请先暂存文件再提交', 'error');
    }

    // 本地提交
    const r = await api.post(`/api/repos/${repo.id}/commits`, { message: msg });
    if (!r.success) {
      const err = r.error || '';
      if (err.includes('Author identity unknown') || err.includes('tell me who you are')) {
        window.toast('请先配置 Git 身份信息', 'error');
        // 弹出快速设置对话框
        showIdentityDialog(repo);
      } else {
        window.toast('提交失败: ' + err, 'error');
      }
      return;
    }

    const stagedCount = statusR.data.staged.length;
    window.toast(`✅ 已提交 ${stagedCount} 个文件 → ${msg}`, 'success');
    msgEl.value = '';

    // 如果需要推送
    if (pushAfter) {
      const chk = container.querySelector('#chk-push-after');
      const shouldPush = chk ? chk.checked : true;
      if (shouldPush) {
        window.toast('正在推送到 origin…', 'info');
        const pushR = await api.post(`/api/repos/${repo.id}/remote/push`, { remote: 'origin', branch: repo.branch });
        if (pushR.success) {
          window.toast('推送成功', 'success');
        } else {
          window.toast('推送失败: ' + (pushR.error || '未知错误'), 'error');
        }
      }
    }

    await loadStatus(container, repo);
    await loadRecentCommits(repo);
    window.eventBus.emit('repo-changed', repo);
  }

  /* ==================== 身份配置弹窗 ==================== */

  async function showIdentityDialog(repo) {
    const ov = document.createElement('div'); ov.className = 'overlay';

    // 先尝试读取已有配置
    let existingName = '', existingEmail = '';
    try {
      const nr = await api.get(`/api/repos/${repo.id}/config?key=user.name`);
      if (nr.success) existingName = nr.data || '';
      const er = await api.get(`/api/repos/${repo.id}/config?key=user.email`);
      if (er.success) existingEmail = er.data || '';
    } catch {}

    ov.innerHTML = `<div class="dialog" style="min-width:380px;">
      <div class="dialog-title">⚙ 配置 Git 身份信息</div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">提交代码前需要设置用户名和邮箱</p>
      <div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-secondary);">用户名</label>
        <input class="input" id="id-name" value="${esc(existingName)}" placeholder="如: Zhang San" style="width:100%;margin-top:4px;" autofocus></div>
      <div style="margin-bottom:4px;"><label style="font-size:12px;color:var(--text-secondary);">邮箱</label>
        <input class="input" id="id-email" value="${esc(existingEmail)}" placeholder="如: zhangsan@example.com" style="width:100%;margin-top:4px;"></div>
      <p style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">此配置仅对当前仓库生效</p>
      <div class="dialog-actions">
        <button class="btn" id="id-cancel">取消</button>
        <button class="btn btn-primary" id="id-save">💾 保存并重试</button>
      </div></div>`;
    document.body.appendChild(ov);

    ov.querySelector('#id-cancel').onclick = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) ov.remove(); };

    ov.querySelector('#id-save').onclick = async () => {
      const name = ov.querySelector('#id-name').value.trim();
      const email = ov.querySelector('#id-email').value.trim();
      if (!name && !email) return window.toast('请至少填写一项', 'error');
      ov.remove();

      if (name) {
        const r = await api.post(`/api/repos/${repo.id}/config`, { key: 'user.name', value: name });
        if (!r.success) return window.toast('设置用户名失败: ' + r.error, 'error');
      }
      if (email) {
        const r = await api.post(`/api/repos/${repo.id}/config`, { key: 'user.email', value: email });
        if (!r.success) return window.toast('设置邮箱失败: ' + r.error, 'error');
      }
      window.toast('身份信息已保存，请重新提交', 'success');
    };
  }

  /* ==================== 最近提交 ==================== */

  async function loadRecentCommits(repo) {
    const el = document.getElementById('recent-commits');
    if (!el) return;
    const r = await api.get(`/api/repos/${repo.id}/commits?limit=5`);
    if (!r.success) { el.innerHTML = `<div class="empty-state"><p>⚠️ ${esc(r.error)}</p></div>`; return; }
    const commits = r.data || [];
    if (commits.length === 0) { el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>暂无提交记录</p></div>'; return; }
    el.innerHTML = `<ul class="commit-list">${commits.map(c => `
      <li class="commit-item" onclick="window.location.hash='#history'">
        <span class="commit-hash">${esc((c.hash||'').slice(0,7))}</span>
        <span class="commit-msg">${esc(c.message || '-')}</span>
        <span class="commit-author">${esc(c.author || '-')}</span>
        <span class="commit-date">${fmtDate(c.date)}</span>
      </li>`).join('')}</ul>`;
  }

  /* ==================== 工具 ==================== */

  function promptPath(title) {
    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.className = 'overlay';
      ov.innerHTML = `<div class="dialog"><div class="dialog-title">${title}</div>
        <input type="text" class="input" id="repo-path-input" placeholder="输入本地路径，如 D:/projects/my-repo" style="width:100%" autofocus>
        <div class="dialog-actions" style="margin-top:16px;">
          <button class="btn" id="dialog-cancel">取消</button>
          <button class="btn btn-primary" id="dialog-ok">确认</button></div></div>`;
      document.body.appendChild(ov);
      const inp = ov.querySelector('#repo-path-input');
      ov.querySelector('#dialog-ok').onclick = () => { ov.remove(); resolve(inp.value.trim() || null); };
      ov.querySelector('#dialog-cancel').onclick = () => { ov.remove(); resolve(null); };
      ov.onclick = e => { if (e.target === ov) { ov.remove(); resolve(null); } };
      inp.focus();
    });
  }

  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function fmtDate(s) {
    if (!s) return '-';
    try {
      const d = new Date(s), now = new Date();
      const min = Math.floor((now-d)/60000);
      if (min < 1) return '刚刚'; if (min < 60) return `${min}分前`;
      const hr = Math.floor(min/60); if (hr < 24) return `${hr}时前`;
      const dy = Math.floor(hr/24); if (dy < 7) return `${dy}天前`;
      return d.toLocaleDateString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit' });
    } catch { return s; }
  }

  /* ==================== 从远程恢复 ==================== */

  async function showRestoreDialog(repo) {
    const ov = document.createElement('div'); ov.className = 'overlay';

    // 获取远程列表
    const rmRes = await api.get(`/api/repos/${repo.id}/remote`);
    const remotes = rmRes.success ? (rmRes.data || []) : [];
    if (remotes.length === 0) {
      window.toast('没有配置远程仓库', 'error');
      return;
    }
    const firstRemote = remotes[0].name;
    const remoteOpts = remotes.map(r => `<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');

    ov.innerHTML = `<div class="dialog" style="min-width:400px;">
      <div class="dialog-title">📥 从远程恢复文件</div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">用远程仓库的文件覆盖本地工作区</p>
      <div style="margin-bottom:8px;"><label style="font-size:12px;color:var(--text-secondary);">远程仓库</label>
        <select class="input" id="restore-remote" style="width:100%;margin-top:4px;">${remoteOpts}</select></div>
      <div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--text-secondary);">分支</label>
        <input class="input" id="restore-branch" value="main" placeholder="如 main 或 master" style="width:100%;margin-top:4px;"></div>
      <p style="font-size:11px;color:#e74c3c;margin-bottom:12px;">⚠ 这会用远程版本覆盖本地文件，本地未提交的改动会丢失</p>
      <div class="dialog-actions">
        <button class="btn" id="restore-cancel">取消</button>
        <button class="btn btn-primary" id="restore-confirm">📥 恢复所有文件</button>
      </div></div>`;
    document.body.appendChild(ov);

    ov.querySelector('#restore-cancel').onclick = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector('#restore-confirm').onclick = async () => {
      const remote = ov.querySelector('#restore-remote').value;
      const branch = ov.querySelector('#restore-branch').value.trim();
      if (!remote || !branch) return window.toast('请选择远程和分支', 'error');
      ov.remove();

      window.toast(`正在从 ${remote}/${branch} 恢复…`, 'info');
      const r = await api.post(`/api/repos/${repo.id}/remote/restore`, { remote, branch });
      if (r.success) {
        window.toast(`已从 ${remote}/${branch} 恢复所有文件`, 'success');
        window.eventBus.emit('repo-changed', repo);
      } else {
        window.toast('恢复失败: ' + (r.error || ''), 'error');
      }
    };
  }

  return { id, name, icon, init, cleanup };
})();

window.dashboardModule = dashboardModule;
