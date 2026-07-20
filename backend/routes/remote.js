/**
 * 远程仓库操作路由 — /api/repos/:repoId/remote
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
 * GET /api/repos/:repoId/remote — 列出远程仓库
 */
router.get('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const result = await git.exec(repoPath, ['remote', '-v']);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '获取远程仓库列表失败' });
  }

  const remotes = git.parseRemotes(result.stdout);
  res.json({ success: true, data: remotes });
});

/**
 * POST /api/repos/:repoId/remote/add — 添加远程仓库
 * Body: { name, url }
 */
router.post('/add', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { name, url } = req.body;
  if (!name || !url) {
    return res.json({ success: false, error: '请提供远程仓库名称和 URL' });
  }

  const result = await git.exec(repoPath, ['remote', 'add', name, url]);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '添加远程仓库失败' });
  }

  res.json({ success: true, data: { name, url } });
});

/**
 * POST /api/repos/:repoId/remote/push — 推送
 * Body: { remote, branch?, force? }
 */
router.post('/push', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { remote, branch, force } = req.body;
  if (!remote) {
    return res.json({ success: false, error: '请提供远程仓库名' });
  }

  const args = ['push', remote];
  if (force) args.splice(1, 0, '--force');
  if (branch) args.push(branch);

  const result = await git.exec(repoPath, args);
  if (!result.success) {
    return res.json({
      success: false,
      error: result.error || '推送失败',
      data: { detail: result.stderr || result.error }
    });
  }

  res.json({ success: true, data: { remote, branch, detail: result.stdout || result.stderr } });
});

/**
 * POST /api/repos/:repoId/remote/pull — 拉取
 * Body: { remote, branch? }
 */
router.post('/pull', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { remote, branch } = req.body;
  if (!remote) {
    return res.json({ success: false, error: '请提供远程仓库名' });
  }

  // 先尝试带分支名拉取，失败则回退到不指定分支
  let args = branch ? ['pull', remote, branch] : ['pull', remote];
  let result = await git.exec(repoPath, args);
  if (!result.success && branch) {
    // 远程可能没有这个分支，尝试不带分支拉取
    result = await git.exec(repoPath, ['pull', remote]);
  }
  if (!result.success && result.error && result.error.includes('did not specify')) {
    // 没有 upstream 跟踪，用 ls-remote 获取远程 HEAD 分支
    const headResult = await git.exec(repoPath, ['ls-remote', '--symref', remote, 'HEAD']);
    let headBranch = '';
    if (headResult.success && headResult.stdout) {
      const m = headResult.stdout.match(/refs\/heads\/(\S+)/);
      if (m) headBranch = m[1];
    }
    if (headBranch) {
      result = await git.exec(repoPath, ['pull', remote, headBranch]);
      // 如果不相关历史或 merge 拒绝，尝试 --allow-unrelated-histories
      if (!result.success && (result.error || '').includes('unrelated histories')) {
        result = await git.exec(repoPath, ['pull', '--allow-unrelated-histories', remote, headBranch]);
      }
    } else {
      // 最后兜底：fetch 后合并远程跟踪分支
      const fetchResult = await git.exec(repoPath, ['fetch', remote]);
      if (fetchResult.success) {
        result = { success: true, stdout: '已获取远程更新，请手动选择分支合并', stderr: '' };
      }
    }
  }
  if (!result.success) {
    return res.json({
      success: false,
      error: result.error || '拉取失败（可能存在冲突或远程分支不存在）',
      data: { detail: result.stderr || result.error }
    });
  }

  res.json({ success: true, data: { remote, branch, detail: result.stdout || result.stderr } });
});

/**
 * POST /api/repos/:repoId/remote/fetch — 获取
 * Body: { remote }
 */
router.post('/fetch', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { remote } = req.body;
  if (!remote) {
    return res.json({ success: false, error: '请提供远程仓库名' });
  }

  const result = await git.exec(repoPath, ['fetch', remote]);
  if (!result.success) {
    return res.json({
      success: false,
      error: result.error || '获取远程更新失败',
      data: { detail: result.stderr || result.error }
    });
  }

  res.json({ success: true, data: { remote, detail: result.stdout || result.stderr } });
});

/**
 * POST /api/repos/:repoId/remote/restore — 从远程分支恢复文件
 * Body: { remote, branch, files?: string[] }  — files 为空则恢复全部
 */
router.post('/restore', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { remote, branch, files } = req.body;
  if (!remote || !branch) {
    return res.json({ success: false, error: '请提供远程名和分支名' });
  }

  const ref = `${remote}/${branch}`;
  const args = ['checkout', ref, '--'];
  if (files && files.length > 0) {
    args.push(...files);
  } else {
    args.push('.');
  }

  const result = await git.exec(repoPath, args);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '恢复文件失败' });
  }

  res.json({ success: true, data: { remote, branch, files: files || ['所有文件'] } });
});

/**
 * DELETE /api/repos/:repoId/remote — 删除远程仓库
 * Body: { name }
 */
router.delete('/', async (req, res) => {
  const repoPath = getRepoPath(req, res);
  if (!repoPath) return;

  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.json({ success: false, error: '请提供远程仓库名' });
  }

  const result = await git.exec(repoPath, ['remote', 'remove', name]);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '删除远程仓库失败' });
  }

  res.json({ success: true, data: { name } });
});

module.exports = router;
