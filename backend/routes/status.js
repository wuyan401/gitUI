/**
 * 工作区状态路由 — /api/repos/:repoId/status
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
 * GET /api/repos/:repoId/status — 工作区状态
 * 返回 { staged, modified, untracked }
 */
router.get('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const result = await git.exec(repoPath, ['status', '--porcelain']);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '获取工作区状态失败' });
  }

  const { staged, modified, untracked } = git.parseStatusPorcelain(result.stdout);
  res.json({ success: true, data: { staged, modified, untracked } });
});

/**
 * POST /api/repos/:repoId/status/stage — 暂存文件
 * Body: { files: string[] }
 */
router.post('/stage', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { files } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.json({ success: false, error: '请提供要暂存的文件列表' });
  }

  const result = await git.exec(repoPath, ['add', '--', ...files]);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '暂存文件失败' });
  }

  res.json({ success: true, data: { files } });
});

/**
 * POST /api/repos/:repoId/status/unstage — 取消暂存
 * Body: { files: string[] }
 */
router.post('/unstage', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { files } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.json({ success: false, error: '请提供要取消暂存的文件列表' });
  }

  const result = await git.exec(repoPath, ['reset', 'HEAD', '--', ...files]);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '取消暂存失败' });
  }

  res.json({ success: true, data: { files } });
});

/**
 * POST /api/repos/:repoId/status/delete — 删除文件（git rm）
 * Body: { files: string[] }
 */
router.post('/delete', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { files } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.json({ success: false, error: '请提供要删除的文件列表' });
  }

  const result = await git.exec(repoPath, ['rm', '--', ...files]);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '删除文件失败' });
  }

  res.json({ success: true, data: { files } });
});

module.exports = router;
