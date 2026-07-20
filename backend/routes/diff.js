/**
 * Diff 查看路由 — /api/repos/:repoId/diff
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
 * GET /api/repos/:repoId/diff — 工作区未暂存 diff
 * Query: ?file=xxx 可选，指定单个文件
 */
router.get('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const file = req.query.file || '';
  const args = ['diff'];
  if (file) args.push('--', file);

  const result = await git.exec(repoPath, args);
  res.json({
    success: true,
    data: {
      diff: result.success ? result.stdout : '',
      error: result.error || ''
    }
  });
});

/**
 * GET /api/repos/:repoId/diff/staged — 暂存区 diff
 * Query: ?file=xxx 可选，指定单个文件
 */
router.get('/staged', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const file = req.query.file || '';
  const args = ['diff', '--cached'];
  if (file) args.push('--', file);

  const result = await git.exec(repoPath, args);
  res.json({
    success: true,
    data: {
      diff: result.success ? result.stdout : '',
      error: result.error || ''
    }
  });
});

/**
 * GET /api/repos/:repoId/diff/:hash — 指定提交的 diff
 */
router.get('/:hash', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { hash } = req.params;

  const result = await git.exec(repoPath, ['show', '--format=', hash]);
  res.json({
    success: true,
    data: {
      diff: result.success ? result.stdout : '',
      error: result.error || ''
    }
  });
});

module.exports = router;
