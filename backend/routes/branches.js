/**
 * 分支管理路由 — /api/repos/:repoId/branches
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const git = require('../git');
const { repos } = require('./repos');

/**
 * 从 URL 参数中获取仓库路径
 */
function getRepoPath(req, res) {
  const { repoId } = req.params;
  if (!repoId) {
    res.json({ success: false, error: '缺少 repoId 参数' });
    return null;
  }
  let repoPath;
  try {
    repoPath = Buffer.from(repoId, 'base64').toString('utf8');
  } catch {
    res.json({ success: false, error: '无效的 repoId' });
    return null;
  }
  if (!repos.has(repoId)) {
    res.json({ success: false, error: '仓库未打开，请先打开仓库' });
    return null;
  }
  return repoPath;
}

/**
 * GET /api/repos/:repoId/branches — 列出所有分支
 */
router.get('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  // 获取本地分支
  const localResult = await git.exec(repoPath, [
    'branch', '--format=%(refname:short)|%(HEAD)'
  ]);
  const local = [];
  if (localResult.success && localResult.stdout) {
    const lines = localResult.stdout.split('\n');
    for (const line of lines) {
      const [name, headMarker] = line.split('|');
      local.push({ name, current: headMarker === '*' });
    }
  }

  // 获取远程分支
  const remoteResult = await git.exec(repoPath, [
    'branch', '-r', '--format=%(refname:short)'
  ]);
  const remote = [];
  if (remoteResult.success && remoteResult.stdout) {
    remoteResult.stdout.split('\n').forEach(name => {
      if (name && !name.includes('HEAD')) {
        remote.push({ name });
      }
    });
  }

  res.json({ success: true, data: { local, remote } });
});

/**
 * POST /api/repos/:repoId/branches — 创建分支
 * Body: { name, from? }
 */
router.post('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { name, from } = req.body;
  if (!name || typeof name !== 'string') {
    return res.json({ success: false, error: '请提供分支名' });
  }

  const args = ['branch', name];
  if (from) args.push(from);

  const result = await git.exec(repoPath, args);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '创建分支失败' });
  }

  res.json({ success: true, data: { name } });
});

/**
 * PUT /api/repos/:repoId/branches/switch — 切换分支
 * Body: { name }
 */
router.put('/switch', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.json({ success: false, error: '请提供分支名' });
  }

  const result = await git.exec(repoPath, ['checkout', name]);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '切换分支失败' });
  }

  // 更新内存中的当前分支
  const { repoId } = req.params;
  if (repos.has(repoId)) {
    repos.get(repoId).branch = name;
  }

  res.json({ success: true, data: { branch: name } });
});

/**
 * DELETE /api/repos/:repoId/branches — 删除分支
 * Body: { name, force? }
 */
router.delete('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { name, force } = req.body;
  if (!name || typeof name !== 'string') {
    return res.json({ success: false, error: '请提供分支名' });
  }

  const args = ['branch', '-d', name];
  if (force) args.splice(1, 0, '-D');

  const result = await git.exec(repoPath, args);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '删除分支失败' });
  }

  res.json({ success: true, data: { name } });
});

/**
 * POST /api/repos/:repoId/branches/merge — 合并分支
 * Body: { from }
 */
router.post('/merge', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { from } = req.body;
  if (!from || typeof from !== 'string') {
    return res.json({ success: false, error: '请提供要合并的源分支名' });
  }

  const result = await git.exec(repoPath, ['merge', from]);
  if (!result.success) {
    return res.json({
      success: false,
      error: result.error || '合并分支失败（可能存在冲突）',
      data: { detail: result.stderr || result.error }
    });
  }

  res.json({ success: true, data: { merged: from, message: result.stdout } });
});

module.exports = router;
