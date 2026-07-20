/**
 * 提交历史路由 — /api/repos/:repoId/commits
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const git = require('../git');

function getRepoPath(req, res) {
  const { repoId } = req.params;
  if (!repoId) {
    res.json({ success: false, error: '缺少 repoId 参数' });
    return null;
  }
  try {
    return Buffer.from(repoId, 'base64').toString('utf8');
  } catch {
    res.json({ success: false, error: '无效的 repoId' });
    return null;
  }
}

/**
 * 解析 git log 输出为提交对象数组
 * 使用自定义分隔符确保字段完整性
 */
function parseLogOutput(stdout) {
  if (!stdout) return [];
  const commits = [];
  const entries = stdout.split('__GITUI_COMMIT_END__').filter(Boolean);

  for (const entry of entries) {
    const lines = entry.trim().split('\n').filter(Boolean);
    if (lines.length < 3) continue;

    const commit = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      switch (key) {
        case 'hash': commit.hash = value; break;
        case 'message': commit.message = value; break;
        case 'author': commit.author = value; break;
        case 'date': commit.date = value; break;
        case 'refs': commit.refs = value; break;
      }
    }
    if (commit.hash) commits.push(commit);
  }

  return commits;
}

/**
 * GET /api/repos/:repoId/commits — 提交历史
 * Query: ?limit=50&skip=0&branch=
 */
router.get('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;
  const branch = req.query.branch || '';

  const format = [
    'hash:%H',
    'message:%s',
    'author:%an <%ae>',
    'date:%aI',
    'refs:%D',
    '__GITUI_COMMIT_END__'
  ].join('%n');

  const args = [
    'log',
    `--format=${format}`,
    `--max-count=${Math.min(limit, 200)}`,
    `--skip=${skip}`,
    '--date=iso-strict'
  ];
  if (branch) args.push(branch);

  let result = await git.exec(repoPath, args);
  // 如果指定了分支但 git 报错（分支不存在等），回退到不指定分支
  if (branch && !result.success) {
    result = await git.exec(repoPath, args.slice(0, -1));
  }

  if (!result.success) {
    return res.json({ success: false, error: result.error || '获取提交历史失败' });
  }

  const commits = parseLogOutput(result.stdout);
  res.json({ success: true, data: commits });
});

/**
 * GET /api/repos/:repoId/commits/:hash — 单个提交详情
 */
router.get('/:hash', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { hash } = req.params;

  // 获取提交基本信息
  const infoResult = await git.exec(repoPath, [
    'show',
    '--no-patch',
    `--format=hash:%H%nmessage:%s%nauthor:%an <%ae>%ndate:%aI`,
    hash
  ]);
  if (!infoResult.success) {
    return res.json({ success: false, error: infoResult.error || '获取提交信息失败' });
  }

  const info = {};
  const infoLines = infoResult.stdout.split('\n');
  for (const line of infoLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    info[line.slice(0, colonIdx)] = line.slice(colonIdx + 1);
  }

  // 获取文件变更列表
  const filesResult = await git.exec(repoPath, [
    'show',
    '--name-status',
    '--format=',
    hash
  ]);
  const files = [];
  if (filesResult.success && filesResult.stdout) {
    const fileLines = filesResult.stdout.split('\n').filter(Boolean);
    for (const line of fileLines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        files.push({ status: parts[0], name: parts.slice(1).join('\t') });
      }
    }
  }

  res.json({
    success: true,
    data: {
      hash: info.hash,
      message: info.message,
      author: info.author,
      date: info.date,
      files
    }
  });
});

/**
 * POST /api/repos/:repoId/commits — 创建提交
 * Body: { message }
 */
router.post('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.json({ success: false, error: '请提供提交信息' });
  }

  // git add -A：暂存所有变更
  const addResult = await git.exec(repoPath, ['add', '-A']);
  if (!addResult.success) {
    return res.json({ success: false, error: addResult.error || '暂存文件失败' });
  }

  // git commit
  const commitResult = await git.exec(repoPath, ['commit', '-m', message]);
  if (!commitResult.success) {
    return res.json({ success: false, error: commitResult.error || '创建提交失败' });
  }

  res.json({ success: true, data: { message, detail: commitResult.stdout } });
});

/**
 * POST /api/repos/:repoId/commits/revert — 回滚指定提交（git revert，安全，保留历史）
 * Body: { hash }
 */
router.post('/revert', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { hash } = req.body;
  if (!hash) return res.json({ success: false, error: '请提供要回滚的 commit hash' });

  const result = await git.exec(repoPath, ['revert', '--no-edit', hash]);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '回滚失败（可能有冲突，请手动处理）' });
  }
  res.json({ success: true, data: { reverted: hash, message: result.stdout } });
});

module.exports = router;
