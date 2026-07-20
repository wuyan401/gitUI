/* ============================================================
   history.js — 提交历史面板（带分支可视化）
   导出：{ id:'history', name:'历史', icon:'📜', init(container), cleanup() }
   功能：时间线提交历史、Canvas 分支图、分页、展开详情
   ============================================================ */

const historyModule = (() => {
  const id = 'history';
  const name = '历史';
  const icon = '📜';

  /** 当前是否活跃 */
  let active = false;
  /** 当前容器引用 */
  let containerEl = null;
  /** 分页状态 */
  let skip = 0;
  const LIMIT = 30;
  let currentBranch = '';
  /** 所有已加载的提交 */
  let allCommits = [];

  /** 分支颜色调色板 */
  const BRANCH_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#2980b9'];
  /** Canvas 配置 */
  const GRAPH = {
    rowHeight: 56,
    dotRadius: 5,
    laneWidth: 22,
    paddingLeft: 14,
    paddingTop: 28,
  };

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

    skip = 0;
    allCommits = [];
    currentBranch = repo.branch || '';

    renderSkeleton(container);
    await loadBranchesForSelector(container, repo);
    await loadCommits(container, repo, true);

    // 监听仓库变化
    window.eventBus.on('repo-changed', handleRepoChange);
  }

  function cleanup() {
    active = false;
    containerEl = null;
  }

  function handleRepoChange(repo) {
    if (!active || !containerEl) return;
    skip = 0;
    allCommits = [];
    if (repo) {
      currentBranch = repo.branch || '';
      renderSkeleton(containerEl);
      loadBranchesForSelector(containerEl, repo);
      loadCommits(containerEl, repo, true);
    } else {
      renderNoRepo(containerEl);
    }
  }

  /* ==================== 渲染 ==================== */

  function renderNoRepo(container) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📜</div>
        <p>请先打开一个仓库以查看提交历史</p>
      </div>`;
  }

  function renderSkeleton(container) {
    container.innerHTML = `
      <div class="toolbar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap;">
        <h2 style="font-size:18px;font-weight:700;color:var(--text);">📜 提交历史</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <select class="input" id="history-branch-select" style="width:auto;min-width:160px;">
            <option value="">全部分支</option>
          </select>
          <button class="btn btn-sm" id="btn-refresh-history">🔄 刷新</button>
        </div>
      </div>
      <div id="history-content" style="display:flex;gap:0;">
        <canvas id="history-graph-canvas" style="flex-shrink:0;"></canvas>
        <div id="history-commit-list" style="flex:1;min-width:0;"></div>
      </div>
      <div id="history-load-more" style="text-align:center;margin-top:16px;"></div>
      <div id="history-commit-detail" style="margin-top:16px;"></div>`;

    // 绑定事件
    container.querySelector('#btn-refresh-history').addEventListener('click', async () => {
      skip = 0;
      allCommits = [];
      const repo = window.state && window.state.currentRepo;
      if (repo && active) await loadCommits(container, repo, true);
    });

    container.querySelector('#history-branch-select').addEventListener('change', async (e) => {
      currentBranch = e.target.value;
      skip = 0;
      allCommits = [];
      const repo = window.state && window.state.currentRepo;
      if (repo && active) await loadCommits(container, repo, true);
    });
  }

  /**
   * 加载分支列表填充下拉框
   */
  async function loadBranchesForSelector(container, repo) {
    const select = container.querySelector('#history-branch-select');
    if (!select) return;

    const result = await window.api.get(`/api/repos/${repo.id}/branches`);
    if (!result.success) return;

    const localBranches = (result.data && result.data.local) || [];
    // 保留第一个 "全部" 选项
    select.innerHTML = '<option value="">全部分支</option>' +
      localBranches.map(b => `<option value="${escapeHtml(b.name)}" ${b.name === currentBranch ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
  }

  /**
   * 加载提交历史
   */
  async function loadCommits(container, repo, reset) {
    const listEl = container.querySelector('#history-commit-list');
    const loadMoreEl = container.querySelector('#history-load-more');

    if (reset) {
      allCommits = [];
      listEl.innerHTML = '<div class="spinner"></div>';
      if (loadMoreEl) loadMoreEl.innerHTML = '';
    }

    const query = `limit=${LIMIT}&skip=${skip}` + (currentBranch ? `&branch=${encodeURIComponent(currentBranch)}` : '');
    const result = await window.api.get(`/api/repos/${repo.id}/commits?${query}`);

    if (!result.success) {
      if (reset) {
        listEl.innerHTML = `<div class="empty-state"><p>⚠️ 加载失败: ${escapeHtml(result.error)}</p></div>`;
      }
      return;
    }

    const commits = result.data || [];

    if (reset && commits.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>暂无提交记录</p></div>';
      drawGraph(container, []);
      return;
    }

    allCommits = reset ? commits : [...allCommits, ...commits];
    skip += commits.length;

    // 渲染提交列表
    renderCommitList(listEl, allCommits);

    // 绘制分支图
    drawGraph(container, allCommits);

    // 加载更多按钮
    if (loadMoreEl) {
      if (commits.length >= LIMIT) {
        loadMoreEl.innerHTML = `<button class="btn" id="btn-load-more">📥 加载更多（已显示 ${allCommits.length} 条）</button>`;
        loadMoreEl.querySelector('#btn-load-more').addEventListener('click', async () => {
          const r = window.state && window.state.currentRepo;
          if (r && active) await loadCommits(container, r, false);
        });
      } else {
        loadMoreEl.innerHTML = `<span style="font-size:12px;color:var(--text-secondary);">已显示全部 ${allCommits.length} 条提交</span>`;
      }
    }
  }

  /**
   * 渲染提交列表（时间线样式）
   */
  function renderCommitList(listEl, commits) {
    listEl.innerHTML = commits.map((c, i) => `
      <div class="commit-timeline-item" data-index="${i}" data-hash="${escapeHtml(c.hash)}" style="
        display:flex;align-items:flex-start;gap:12px;padding:10px 12px;
        border-bottom:1px solid var(--border);
        transition:background 0.1s ease;
      " onmouseenter="this.style.background='var(--surface-hover)'" onmouseleave="this.style.background=''">
        <div style="
          flex-shrink:0;width:10px;height:10px;border-radius:50%;
          background:${getCommitColor(c, i)};margin-top:5px;
        "></div>
        <div style="flex:1;min-width:0;cursor:pointer;" class="commit-info">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
            <span style="font-family:ui-monospace,monospace;font-size:12px;color:var(--accent);font-weight:600;">
              ${escapeHtml((c.hash || '').slice(0, 7))}
            </span>
            <span style="font-size:13px;color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${escapeHtml(c.message || c.subject || '-')}
            </span>
          </div>
          <div style="display:flex;gap:16px;font-size:11px;color:var(--text-secondary);">
            <span>👤 ${escapeHtml(c.author || '-')}</span>
            <span>🕐 ${formatDate(c.date)}</span>
            ${c.refs ? `<span class="badge badge-accent" style="font-size:10px;">${escapeHtml(c.refs)}</span>` : ''}
          </div>
        </div>
        <div style="flex-shrink:0;display:flex;gap:4px;align-self:center;">
          <button class="btn btn-sm btn-revert" data-hash="${escapeHtml(c.hash)}" data-msg="${escapeHtml(c.message||'').replace(/"/g,'&quot;')}" title="回滚此提交（安全，保留历史）">↩ 回滚</button>
          <button class="btn btn-sm btn-danger btn-reset" data-hash="${escapeHtml(c.hash)}" title="重置到此提交">⟲ 重置</button>
        </div>
      </div>
    `).join('');

    // 绑定点击 — 展开详情
    listEl.querySelectorAll('.commit-info').forEach(el => {
      el.addEventListener('click', async () => {
        const hash = el.parentElement.dataset.hash;
        const repo = window.state && window.state.currentRepo;
        if (repo && active) await loadCommitDetail(hash, repo);
      });
    });

    // 绑定回滚按钮
    listEl.querySelectorAll('.btn-revert').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const hash = btn.dataset.hash;
        const msg = btn.dataset.msg;
        const confirmed = await window.confirm('回滚提交', `确认回滚提交 "${msg}"？\n这将创建一个新的反向提交，不会删除历史。`);
        if (!confirmed) return;
        btn.disabled = true;
        btn.textContent = '⏳ 回滚中…';
        await doRevert(hash);
      });
    });

    // 绑定重置按钮
    listEl.querySelectorAll('.btn-reset').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const hash = btn.dataset.hash;
        showResetDialog(hash);
      });
    });
  }

  /** 获取提交点的颜色 */
  function getCommitColor(commit, index) {
    // 使用分支颜色轮转
    return BRANCH_COLORS[index % BRANCH_COLORS.length];
  }

  /* ==================== Canvas 分支图 ==================== */

  /**
   * 计算每个提交的 lane 分配
   * 返回: [{ lane, color, hasMerge, mergeFromLane }]
   */
  function computeLanes(commits) {
    if (!commits || commits.length === 0) return [];

    const lanes = [];
    // hash → lane 映射
    const hashToLane = new Map();
    // 当前活跃的 lane 集合
    let activeLanes = new Set();
    let nextLane = 0;
    // 颜色分配: lane → color
    const laneColors = new Map();

    // 从最早到最新处理（逆序）
    const reversed = [...commits].reverse();

    for (const commit of reversed) {
      const hash = commit.hash;
      const parents = commit.parents || [];

      let lane;

      if (hashToLane.has(hash)) {
        // 已被子提交分配了 lane
        lane = hashToLane.get(hash);
      } else if (parents.length === 0) {
        // 根提交，分配新 lane
        lane = nextLane++;
        laneColors.set(lane, BRANCH_COLORS[lane % BRANCH_COLORS.length]);
      } else if (parents.length === 1) {
        // 单父提交，继承父的 lane（如果父已有 lane）
        const parentHash = parents[0];
        if (hashToLane.has(parentHash)) {
          lane = hashToLane.get(parentHash);
        } else {
          lane = nextLane++;
          laneColors.set(lane, BRANCH_COLORS[lane % BRANCH_COLORS.length]);
          hashToLane.set(parentHash, lane);
        }
      } else {
        // 合并提交：主 lane 用第一个父提交的 lane
        const mainLane = hashToLane.get(parents[0]) || nextLane;
        if (!hashToLane.has(parents[0])) {
          hashToLane.set(parents[0], mainLane);
          laneColors.set(mainLane, BRANCH_COLORS[mainLane % BRANCH_COLORS.length]);
          nextLane = Math.max(nextLane, mainLane + 1);
        }
        lane = mainLane;

        // 其他父提交分配各自的 lane
        for (let i = 1; i < parents.length; i++) {
          if (!hashToLane.has(parents[i])) {
            const pLane = nextLane++;
            hashToLane.set(parents[i], pLane);
            laneColors.set(pLane, BRANCH_COLORS[pLane % BRANCH_COLORS.length]);
          }
        }
      }

      hashToLane.set(hash, lane);
      activeLanes.add(lane);
    }

    // 重新正向处理，收集每个提交的信息
    const commitLanes = [];
    for (const commit of commits) {
      const lane = hashToLane.get(commit.hash) || 0;
      const color = laneColors.get(lane) || BRANCH_COLORS[0];
      const parents = (commit.parents || []).map(p => hashToLane.get(p)).filter(l => l !== undefined);

      // 计算合并信息
      let mergeFromLane = null;
      if (parents.length > 1) {
        mergeFromLane = parents.filter(l => l !== lane)[0] || null;
      }

      commitLanes.push({
        lane,
        color,
        parents,
        mergeFromLane,
      });
    }

    // 计算每一行需要绘制的活跃 lane 范围
    // 从每个提交回溯到其父提交，确定哪些 lane 在本行活跃
    for (let i = 0; i < commitLanes.length; i++) {
      const current = commitLanes[i];
      const allActiveLanes = new Set();

      // 当前提交自己的 lane
      allActiveLanes.add(current.lane);

      // 检查后续提交是否引用了当前提交之前的 lane
      for (let j = i; j < commitLanes.length; j++) {
        allActiveLanes.add(commitLanes[j].lane);
        if (commitLanes[j].mergeFromLane !== null) {
          allActiveLanes.add(commitLanes[j].mergeFromLane);
        }
      }

      // 检查前面的提交（已经渲染过的）是否有 lane 还在后面活跃
      for (let k = 0; k < i; k++) {
        const prev = commitLanes[k];
        // 如果这个 lane 在后面还会出现，保持活跃
        let stillActive = false;
        for (let m = i + 1; m < commitLanes.length; m++) {
          if (commitLanes[m].lane === prev.lane ||
              (commitLanes[m].parents && commitLanes[m].parents.includes(prev.lane))) {
            stillActive = true;
            break;
          }
        }
        if (stillActive) {
          allActiveLanes.add(prev.lane);
        }
      }

      commitLanes[i].activeLanes = [...allActiveLanes].sort((a, b) => a - b);
    }

    return commitLanes;
  }

  /**
   * 绘制 Canvas 分支图
   */
  function drawGraph(container, commits) {
    const canvas = container.querySelector('#history-graph-canvas');
    if (!canvas) return;

    if (commits.length === 0) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = 'block';
    const laneInfo = computeLanes(commits);

    // 计算需要的最大 lane 数
    let maxLane = 0;
    for (const info of laneInfo) {
      for (const l of info.activeLanes) {
        if (l > maxLane) maxLane = l;
      }
    }

    const totalLanes = maxLane + 1;
    const width = GRAPH.paddingLeft * 2 + totalLanes * GRAPH.laneWidth;
    const height = commits.length * GRAPH.rowHeight;

    // 处理 DPI 缩放
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 清空
    ctx.clearRect(0, 0, width, height);

    // lane 中心 X 坐标映射
    function laneX(lane) {
      return GRAPH.paddingLeft + lane * GRAPH.laneWidth + GRAPH.laneWidth / 2;
    }

    // 为每个 lane 收集所有活跃的行范围
    // 先构建每个 lane 的起始位置（上一行的 lane 位置作为延续线起点）
    const laneLastY = new Map(); // lane → last Y position

    for (let i = 0; i < commits.length; i++) {
      const info = laneInfo[i];
      const y = i * GRAPH.rowHeight + GRAPH.paddingTop;
      const x = laneX(info.lane);
      const color = info.color;

      // 绘制活跃的垂直 lane 线
      for (const l of info.activeLanes) {
        const lx = laneX(l);
        const laneColor = BRANCH_COLORS[l % BRANCH_COLORS.length];

        if (laneLastY.has(l)) {
          // 从上一位置画垂直线
          ctx.strokeStyle = laneColor;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(lx, laneLastY.get(l));
          ctx.lineTo(lx, y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // 延伸到本行底部（除非这是最后一个该 lane 的提交）
        laneLastY.set(l, y);
      }

      // 绘制合并的水平连接线
      if (info.mergeFromLane !== null) {
        const fromX = laneX(info.mergeFromLane);
        ctx.strokeStyle = BRANCH_COLORS[info.mergeFromLane % BRANCH_COLORS.length];
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        // 从被合并的 lane 水平连接到当前 lane
        const curveY = y - GRAPH.rowHeight * 0.3;
        ctx.moveTo(fromX, curveY);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // 绘制当前行的点
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, GRAPH.dotRadius, 0, Math.PI * 2);
      ctx.fill();

      // 白色边框
      ctx.strokeStyle = 'var(--bg)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 更新当前 lane 的最后位置
      laneLastY.set(info.lane, y);
    }
  }

  /* ==================== 提交详情 ==================== */

  async function loadCommitDetail(hash, repo) {
    const detailEl = containerEl.querySelector('#history-commit-detail');
    if (!detailEl) return;

    detailEl.innerHTML = '<div class="spinner"></div>';

    const result = await window.api.get(`/api/repos/${repo.id}/commits/${hash}`);
    if (!result.success) {
      detailEl.innerHTML = `<div class="empty-state"><p>⚠️ 加载详情失败: ${escapeHtml(result.error)}</p></div>`;
      return;
    }

    const commit = result.data;
    const files = commit.files || [];
    const stats = commit.stats || {};

    detailEl.innerHTML = `
      <div class="card" style="margin-top:0;">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>📄 提交详情</span>
          <button class="btn btn-sm" id="btn-close-detail">✕ 关闭</button>
        </div>
        <div style="margin-bottom:12px;">
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
            <span><strong>Hash:</strong> <code style="color:var(--accent);">${escapeHtml(commit.hash)}</code></span>
            <span><strong>作者:</strong> ${escapeHtml(commit.author)}</span>
            <span><strong>日期:</strong> ${escapeHtml(commit.date)}</span>
          </div>
          <div style="font-size:14px;color:var(--text);font-weight:500;white-space:pre-wrap;">${escapeHtml(commit.message || commit.subject || '-')}</div>
        </div>
        ${stats.filesChanged !== undefined ? `
          <div style="display:flex;gap:16px;margin-bottom:12px;font-size:12px;">
            <span style="color:#27ae60;">+${stats.insertions || 0}</span>
            <span style="color:#e74c3c;">-${stats.deletions || 0}</span>
            <span style="color:var(--text-secondary);">${stats.filesChanged || 0} 个文件</span>
          </div>
        ` : ''}
        ${files.length > 0 ? `
          <div style="border:1px solid var(--border);border-radius:4px;overflow:hidden;">
            ${files.map(f => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;">
                <span style="color:var(--text);font-family:ui-monospace,monospace;">${escapeHtml(f.file || f.path || '-')}</span>
                <span style="display:flex;gap:8px;font-family:ui-monospace,monospace;">
                  <span style="color:#27ae60;">+${f.insertions || f.additions || 0}</span>
                  <span style="color:#e74c3c;">-${f.deletions || 0}</span>
                </span>
              </div>
            `).join('')}
          </div>
        ` : '<p style="font-size:12px;color:var(--text-secondary);">无文件变更信息</p>'}
      </div>`;

    // 绑定关闭按钮
    const closeBtn = detailEl.querySelector('#btn-close-detail');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => { detailEl.innerHTML = ''; });
    }
  }

  /* ==================== 工具函数 ==================== */

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return '刚刚';
      if (diffMin < 60) return `${diffMin} 分钟前`;
      if (diffHr < 24) return `${diffHr} 小时前`;
      if (diffDay < 7) return `${diffDay} 天前`;

      return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  /* ==================== 回滚 & 重置 ==================== */

  async function doRevert(hash) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;
    window.toast('正在回滚…', 'info');
    const r = await window.api.post(`/api/repos/${repo.id}/commits/revert`, { hash });
    if (r.success) {
      window.toast('回滚成功', 'success');
      refreshHistory();
    } else {
      const err = r.error || '';
      if (err.includes('already') || err.includes('nothing to') || err.includes('no changes')) {
        window.toast('该提交已被回滚，无需重复操作', 'info');
      } else if (err.includes('conflict') || err.includes('CONFLICT')) {
        window.toast('回滚发生冲突，请手动解决后提交', 'error');
      } else if (err.includes('not a git repository')) {
        window.toast('仓库状态异常', 'error');
      } else {
        window.toast('回滚失败: ' + err.slice(0, 80), 'error');
      }
    }
  }

  function showResetDialog(hash) {
    const repo = window.state && window.state.currentRepo;
    if (!repo) return;

    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="dialog" style="min-width:380px;">
      <div class="dialog-title">⟲ 重置到此提交</div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">
        将 HEAD 移动到 <code>${escapeHtml(hash.slice(0,7))}</code>
      </p>
      <div style="margin-bottom:12px;">
        <label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;">
          <input type="radio" name="reset-mode" value="soft" checked>
          <div><strong>Soft</strong> — 仅移动 HEAD，保留暂存区和工作区</div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;">
          <input type="radio" name="reset-mode" value="mixed">
          <div><strong>Mixed</strong> — 移动 HEAD + 清空暂存区，保留工作区</div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border:1px solid var(--border);border-radius:6px;">
          <input type="radio" name="reset-mode" value="hard">
          <div style="color:#e74c3c;"><strong>Hard ⚠</strong> — 全部丢弃，不可恢复</div>
        </label>
      </div>
      <div class="dialog-actions">
        <button class="btn" id="reset-cancel">取消</button>
        <button class="btn btn-danger" id="reset-confirm">确认重置</button>
      </div></div>`;
    document.body.appendChild(ov);

    ov.querySelector('#reset-cancel').onclick = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector('#reset-confirm').onclick = async () => {
      const mode = ov.querySelector('input[name="reset-mode"]:checked').value;
      ov.remove();
      window.toast('正在重置…', 'info');
      const r = await window.api.post(`/api/repos/${repo.id}/reset`, { hash, mode });
      if (r.success) {
        window.toast(`已重置 (--${mode})`, 'success');
        window.eventBus.emit('repo-changed', repo);
        refreshHistory();
      } else {
        window.toast('重置失败: ' + (r.error || ''), 'error');
      }
    };
  }

  function refreshHistory() {
    if (!active || !containerEl) return;
    skip = 0; allCommits = [];
    const repo = window.state && window.state.currentRepo;
    if (repo) {
      renderSkeleton(containerEl);
      loadBranchesForSelector(containerEl, repo);
      loadCommits(containerEl, repo, true);
    }
  }

  return { id, name, icon, init, cleanup };
})();

// 挂载到全局
window.historyModule = historyModule;
