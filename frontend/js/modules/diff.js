/* ============================================================
   diff.js — Diff 查看器
   导出：{ id:'diff', name:'差异', icon:'📊', init(container), cleanup() }
   功能：工作区/暂存区 diff 查看、文件列表、GitHub 风格 diff 渲染
   ============================================================ */

const diffModule = (() => {
  const id = 'diff';
  const name = '差异';
  const icon = '📊';

  /** 当前是否活跃 */
  let active = false;
  /** 当前容器引用 */
  let containerEl = null;
  /** 当前查看类型：'unstaged' | 'staged' */
  let viewType = 'unstaged';
  /** 所有变更文件列表 */
  let changedFiles = [];
  /** 当前选中的文件 diff 内容 */
  let currentDiffData = null;

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

    renderSkeleton(container);
    bindEvents(container);
    await loadDiff(container, repo);

    // 监听仓库变化
    window.eventBus.on('repo-changed', handleRepoChange);
  }

  function cleanup() {
    active = false;
    containerEl = null;
    changedFiles = [];
    currentDiffData = null;
  }

  function handleRepoChange(repo) {
    if (!active || !containerEl) return;
    changedFiles = [];
    currentDiffData = null;
    if (repo) {
      renderSkeleton(containerEl);
      bindEvents(containerEl);
      loadDiff(containerEl, repo);
    } else {
      renderNoRepo(containerEl);
    }
  }

  /* ==================== 渲染 ==================== */

  function renderNoRepo(container) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <p>请先打开一个仓库以查看差异</p>
      </div>`;
  }

  function renderSkeleton(container) {
    container.innerHTML = `
      <div class="toolbar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap;">
        <h2 style="font-size:18px;font-weight:700;color:var(--text);">📊 差异对比</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <select class="input" id="diff-view-type" style="width:auto;min-width:150px;">
            <option value="unstaged">📝 工作区变更</option>
            <option value="staged">📦 暂存区变更</option>
          </select>
          <button class="btn btn-sm" id="btn-refresh-diff">🔄 刷新</button>
        </div>
      </div>
      <div style="display:flex;gap:16px;height:calc(100vh - 160px);">
        <!-- 左侧文件列表 -->
        <div id="diff-file-list" style="width:240px;min-width:240px;overflow-y:auto;flex-shrink:0;">
          <div class="spinner"></div>
        </div>
        <!-- 右侧 diff 内容 -->
        <div id="diff-content-area" style="flex:1;overflow-y:auto;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
          <div id="diff-display" style="padding:0;">
            <div class="empty-state">
              <div class="empty-state-icon">📄</div>
              <p>请从左侧选择一个文件查看差异</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  function bindEvents(container) {
    const viewTypeSelect = container.querySelector('#diff-view-type');
    if (viewTypeSelect) {
      viewTypeSelect.addEventListener('change', async (e) => {
        viewType = e.target.value;
        const repo = window.state && window.state.currentRepo;
        if (repo && active) await loadDiff(container, repo);
      });
    }

    const refreshBtn = container.querySelector('#btn-refresh-diff');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        const repo = window.state && window.state.currentRepo;
        if (repo && active) await loadDiff(container, repo);
      });
    }
  }

  /* ==================== 数据加载 ==================== */

  /**
   * 加载 diff 数据
   */
  async function loadDiff(container, repo) {
    const fileListEl = container.querySelector('#diff-file-list');
    const diffDisplayEl = container.querySelector('#diff-display');

    if (fileListEl) fileListEl.innerHTML = '<div class="spinner"></div>';

    const endpoint = viewType === 'staged'
      ? `/api/repos/${repo.id}/diff/staged`
      : `/api/repos/${repo.id}/diff`;

    const result = await window.api.get(endpoint);

    if (!result.success) {
      if (fileListEl) {
        fileListEl.innerHTML = `<div class="empty-state" style="padding:16px;"><p>⚠️ ${escapeHtml(result.error)}</p></div>`;
      }
      if (diffDisplayEl) {
        diffDisplayEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>加载差异失败</p></div>`;
      }
      return;
    }

    // 后端返回 {diff: "text", error: ""}，提取 diff 字符串
    const diffText = (result.data && result.data.diff) || '';
    parseDiffData(diffText);

    // 渲染文件列表
    renderFileList(fileListEl);
  }

  /**
   * 解析 diff 原始数据，提取文件列表和每个文件的 diff
   */
  function parseDiffData(rawData) {
    changedFiles = [];
    currentDiffData = null;

    if (!rawData) return;

    // 如果是字符串格式（完整 diff 输出）
    if (typeof rawData === 'string') {
      const diffText = rawData;
      // 按 diff --git 分割
      const fileSections = diffText.split(/(?=^diff --git )/m).filter(Boolean);

      for (const section of fileSections) {
        const fileInfo = parseDiffSection(section);
        if (fileInfo) {
          changedFiles.push(fileInfo);
        }
      }
      return;
    }

    // 如果是数组格式（结构化数据）
    if (Array.isArray(rawData)) {
      changedFiles = rawData.map(f => ({
        path: f.file || f.path || f.name || 'unknown',
        oldPath: f.oldPath || null,
        status: f.status || 'M',
        diff: f.diff || f.patch || '',
        additions: f.additions || f.insertions || 0,
        deletions: f.deletions || 0,
        binary: f.binary || false,
      }));
      return;
    }

    // 如果是对象，尝试提取 files 字段
    if (typeof rawData === 'object' && rawData !== null) {
      if (rawData.files && Array.isArray(rawData.files)) {
        changedFiles = rawData.files.map(f => ({
          path: f.file || f.path || f.name || 'unknown',
          oldPath: f.oldPath || null,
          status: f.status || 'M',
          diff: f.diff || f.patch || '',
          additions: f.additions || f.insertions || 0,
          deletions: f.deletions || 0,
          binary: f.binary || false,
        }));
        if (typeof rawData.raw === 'string') {
          // 如果有完整 raw diff，尝试按文件解析
          currentDiffData = { raw: rawData.raw };
        }
        return;
      }
    }
  }

  /**
   * 解析单个 diff --git 段落
   */
  function parseDiffSection(section) {
    const lines = section.split('\n');

    // 提取文件路径
    const diffGitMatch = section.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (!diffGitMatch) return null;

    const oldPath = diffGitMatch[1];
    const newPath = diffGitMatch[2];
    const filePath = newPath === '/dev/null' ? oldPath : newPath;

    // 判断文件状态
    let status = 'M'; // 默认 Modified
    const headerLines = lines.slice(0, 10).join('\n');
    if (headerLines.includes('new file mode')) status = 'A';
    else if (headerLines.includes('deleted file mode')) status = 'D';
    else if (headerLines.includes('rename from')) status = 'R';

    // 统计增减行数
    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }

    // 判断是否为二进制文件
    const binary = section.includes('Binary files');

    return {
      path: filePath,
      oldPath: oldPath !== newPath ? oldPath : null,
      status,
      diff: section.trim(),
      additions,
      deletions,
      binary,
    };
  }

  /* ==================== 文件列表渲染 ==================== */

  function renderFileList(fileListEl) {
    if (!fileListEl) return;

    if (changedFiles.length === 0) {
      fileListEl.innerHTML = `
        <div class="card" style="padding:16px;">
          <div class="section-title">📁 变更文件</div>
          <div class="empty-state" style="padding:20px;">
            <div class="empty-state-icon">✨</div>
            <p>${viewType === 'staged' ? '暂存区无变更' : '工作区干净，无变更'}</p>
          </div>
        </div>`;
      // 同时更新右侧
      const diffDisplayEl = containerEl && containerEl.querySelector('#diff-display');
      if (diffDisplayEl) {
        diffDisplayEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">✨</div>
            <p>${viewType === 'staged' ? '暂存区无变更' : '工作区干净，无变更'}</p>
          </div>`;
      }
      return;
    }

    const totalAdditions = changedFiles.reduce((s, f) => s + (f.additions || 0), 0);
    const totalDeletions = changedFiles.reduce((s, f) => s + (f.deletions || 0), 0);

    fileListEl.innerHTML = `
      <div class="card" style="padding:16px;">
        <div class="section-title">
          📁 变更文件
          <span class="badge badge-accent">${changedFiles.length}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;display:flex;gap:12px;">
          <span style="color:#27ae60;">+${totalAdditions}</span>
          <span style="color:#e74c3c;">-${totalDeletions}</span>
        </div>
        <div id="diff-file-items">
          ${changedFiles.map((f, i) => `
            <div class="diff-file-item" data-index="${i}" style="
              display:flex;align-items:center;justify-content:space-between;
              padding:8px 10px;border-radius:4px;cursor:pointer;
              transition:background 0.1s ease;font-size:12px;
              ${i === 0 ? 'background:var(--surface-hover);' : ''}
            " onmouseenter="this.style.background='var(--surface-hover)'" onmouseleave="if(!this.classList.contains('active'))this.style.background=''">
              <div style="display:flex;align-items:center;gap:6px;overflow:hidden;min-width:0;">
                <span style="flex-shrink:0;font-size:10px;font-weight:700;color:${statusColor(f.status)};">
                  ${statusIcon(f.status)}
                </span>
                <span style="font-family:ui-monospace,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);">
                  ${escapeHtml(getFileName(f.path))}
                </span>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;font-family:ui-monospace,monospace;font-size:10px;margin-left:8px;">
                ${f.additions > 0 ? `<span style="color:#27ae60;">+${f.additions}</span>` : ''}
                ${f.deletions > 0 ? `<span style="color:#e74c3c;">-${f.deletions}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;

    // 绑定文件点击事件
    const items = fileListEl.querySelectorAll('.diff-file-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        // 高亮当前选中
        items.forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        // 渲染 diff
        renderDiffContent(changedFiles[index]);
      });
    });

    // 默认显示第一个文件
    if (changedFiles.length > 0) {
      items[0].classList.add('active');
      renderDiffContent(changedFiles[0]);
    }
  }

  function statusIcon(status) {
    const icons = { A: '＋', M: '~', D: '－', R: '→' };
    return icons[status] || status;
  }

  function statusColor(status) {
    const colors = { A: '#27ae60', M: '#f39c12', D: '#e74c3c', R: '#3498db' };
    return colors[status] || '#888';
  }

  function getFileName(fullPath) {
    if (!fullPath) return '';
    const parts = fullPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
  }

  /* ==================== Diff 内容渲染 ==================== */

  /**
   * 渲染单个文件的 diff 内容（GitHub 风格）
   */
  function renderDiffContent(fileInfo) {
    const diffDisplayEl = containerEl && containerEl.querySelector('#diff-display');
    if (!diffDisplayEl) return;

    if (!fileInfo || !fileInfo.diff) {
      diffDisplayEl.innerHTML = `<div class="empty-state"><p>无法显示此文件的差异</p></div>`;
      return;
    }

    if (fileInfo.binary) {
      diffDisplayEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <p>二进制文件，无法显示差异</p>
        </div>`;
      return;
    }

    const diffText = fileInfo.diff;
    const hunks = parseDiffHunks(diffText);

    diffDisplayEl.innerHTML = `
      <div class="diff-view">
        <!-- 文件头部 -->
        <div class="diff-file-header" style="
          padding:10px 16px;background:var(--surface-hover);border-bottom:1px solid var(--border);
          display:flex;align-items:center;gap:8px;font-size:12px;position:sticky;top:0;z-index:1;
        ">
          <span style="font-weight:600;color:var(--text);">${escapeHtml(fileInfo.path)}</span>
          ${fileInfo.oldPath ? `<span style="color:var(--text-secondary);">(来自 ${escapeHtml(fileInfo.oldPath)})</span>` : ''}
          <span style="margin-left:auto;display:flex;gap:8px;font-family:ui-monospace,monospace;">
            <span style="color:#27ae60;">+${fileInfo.additions || 0}</span>
            <span style="color:#e74c3c;">-${fileInfo.deletions || 0}</span>
          </span>
        </div>
        <!-- Diff 内容 -->
        <div class="diff-content" style="font-family:ui-monospace,'Cascadia Code','Source Code Pro',Menlo,Consolas,monospace;font-size:12px;line-height:1.6;overflow-x:auto;">
          <table class="diff-table" style="width:100%;border-collapse:collapse;">
            ${hunks.map(hunk => {
              const headerHtml = `
                <tr class="diff-hunk-header" style="background:var(--surface-hover);">
                  <td colspan="3" style="padding:6px 16px;color:var(--accent);font-size:11px;font-weight:600;">
                    @@ ${hunk.header} @@
                  </td>
                </tr>`;

              const linesHtml = hunk.lines.map(line => {
                const typeClass = line.type === 'add' ? 'diff-add'
                  : line.type === 'del' ? 'diff-del'
                  : 'diff-context';
                const bgColor = line.type === 'add' ? '#e6ffec'
                  : line.type === 'del' ? '#ffebe9'
                  : 'transparent';
                const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
                const prefixColor = line.type === 'add' ? '#27ae60'
                  : line.type === 'del' ? '#e74c3c'
                  : 'var(--text-secondary)';

                return `
                  <tr class="${typeClass}" style="background:${bgColor};">
                    <td class="diff-line-num" style="
                      width:1%;min-width:50px;padding:0 8px;text-align:right;
                      color:var(--text-secondary);font-size:11px;user-select:none;
                      background:rgba(0,0,0,0.03);vertical-align:top;
                    ">${line.oldNum || ''}</td>
                    <td class="diff-line-num" style="
                      width:1%;min-width:50px;padding:0 8px;text-align:right;
                      color:var(--text-secondary);font-size:11px;user-select:none;
                      background:rgba(0,0,0,0.03);vertical-align:top;
                    ">${line.newNum || ''}</td>
                    <td style="padding:0 12px;vertical-align:top;white-space:pre-wrap;word-break:break-all;">
                      <span style="color:${prefixColor};user-select:none;margin-right:4px;">${prefix}</span>${escapeHtml(line.content)}
                    </td>
                  </tr>`;
              }).join('');

              return headerHtml + linesHtml;
            }).join('')}
          </table>
        </div>
      </div>`;
  }

  /**
   * 解析 diff 文本为 hunks 结构
   * 返回: [{ header: '-a,b +c,d', lines: [{ type:'add'|'del'|'context', oldNum, newNum, content }] }]
   */
  function parseDiffHunks(diffText) {
    const hunks = [];
    const lines = diffText.split('\n');

    let currentHunk = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      // 跳过文件头行
      if (line.startsWith('diff --git') || line.startsWith('index ') ||
          line.startsWith('new file') || line.startsWith('deleted file') ||
          line.startsWith('rename ') || line.startsWith('similarity ') ||
          line.startsWith('Binary files') || line.startsWith('old mode') ||
          line.startsWith('new mode')) {
        continue;
      }

      // 处理 --- / +++ 行
      if (line.startsWith('--- ')) continue;
      if (line.startsWith('+++ ')) continue;

      // 处理 @@ hunk 头部
      const hunkMatch = line.match(/^@@\s+(.+?)\s+@@/);
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = { header: hunkMatch[1].trim(), lines: [] };

        // 解析行号
        const hunkParts = hunkMatch[1].trim();
        const numsMatch = hunkParts.match(/-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?/);
        if (numsMatch) {
          oldLineNum = parseInt(numsMatch[1]);
          newLineNum = parseInt(numsMatch[3]);
        }
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add', oldNum: '', newNum: newLineNum, content: line.slice(1) });
        newLineNum++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'del', oldNum: oldLineNum, newNum: '', content: line.slice(1) });
        oldLineNum++;
      } else {
        // 上下文行（以空格开头或空行）
        const content = line.startsWith(' ') ? line.slice(1) : line;
        currentHunk.lines.push({ type: 'context', oldNum: oldLineNum, newNum: newLineNum, content });
        oldLineNum++;
        newLineNum++;
      }
    }

    if (currentHunk && currentHunk.lines.length > 0) {
      hunks.push(currentHunk);
    }

    return hunks;
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
window.diffModule = diffModule;
