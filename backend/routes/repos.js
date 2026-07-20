/**
 * 仓库管理路由 — /api/repos
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const git = require('../git');

// 内存存储：repoId → { id, name, path, branch }
const repos = new Map();

/**
 * 扫描路径下是否有有效的目录
 */
function isValidDir(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 从路径生成 repoId（base64 编码）
 */
function toRepoId(repoPath) {
  return Buffer.from(repoPath).toString('base64');
}

/**
 * GET /api/repos — 列出所有已保存的仓库
 */
router.get('/', (req, res) => {
  const list = Array.from(repos.values());
  res.json({ success: true, data: list });
});

/**
 * POST /api/repos/open — 打开已有仓库
 * Body: { path: string }
 */
router.post('/open', async (req, res) => {
  const { path: repoPath } = req.body;

  if (!repoPath || typeof repoPath !== 'string') {
    return res.json({ success: false, error: '请提供仓库路径' });
  }

  // 检查路径是否存在
  if (!isValidDir(repoPath)) {
    return res.json({ success: false, error: `路径不存在或不是目录: ${repoPath}` });
  }

  // 检查是否是 git 仓库
  const gitDir = path.join(repoPath, '.git');
  try {
    if (!fs.statSync(gitDir).isDirectory()) {
      return res.json({ success: false, error: '该路径不是 Git 仓库（未找到 .git 目录）' });
    }
  } catch {
    return res.json({ success: false, error: '该路径不是 Git 仓库（未找到 .git 目录）' });
  }

  // 获取当前分支
  const branchResult = await git.exec(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchResult.success ? branchResult.stdout : 'main';

  const repoId = toRepoId(repoPath);

  // 存入内存
  const repoInfo = {
    id: repoId,
    name: path.basename(repoPath),
    path: repoPath,
    branch
  };
  repos.set(repoId, repoInfo);

  res.json({ success: true, data: repoInfo });
});

/**
 * POST /api/repos/init — 初始化新仓库
 * Body: { path: string }
 */
router.post('/init', async (req, res) => {
  const { path: repoPath } = req.body;

  if (!repoPath || typeof repoPath !== 'string') {
    return res.json({ success: false, error: '请提供仓库路径' });
  }

  // 如果目录不存在则创建
  if (!isValidDir(repoPath)) {
    try {
      fs.mkdirSync(repoPath, { recursive: true });
    } catch (err) {
      return res.json({ success: false, error: `创建目录失败: ${err.message}` });
    }
  }

  // 执行 git init
  const result = await git.exec(repoPath, ['init']);
  if (!result.success) {
    return res.json({ success: false, error: result.error || '初始化 Git 仓库失败' });
  }

  const repoId = toRepoId(repoPath);
  const repoInfo = {
    id: repoId,
    name: path.basename(repoPath),
    path: repoPath,
    branch: 'main'
  };
  repos.set(repoId, repoInfo);

  res.json({ success: true, data: repoInfo });
});

/**
 * POST /api/repos/clone — 克隆远程仓库
 * Body: { url: string, path: string }
 */
router.post('/clone', async (req, res) => {
  const { url, path: targetPath } = req.body;

  if (!url || typeof url !== 'string') {
    return res.json({ success: false, error: '请提供远程仓库 URL' });
  }

  if (!targetPath || typeof targetPath !== 'string') {
    return res.json({ success: false, error: '请提供本地目标路径' });
  }

  // 规范化路径：反斜杠转正斜杠，去掉首尾引号
  const safePath = targetPath.replace(/\\/g, '/').replace(/^["']|["']$/g, '');

  // 检查目标路径是否已存在
  try {
    if (fs.existsSync(safePath)) {
      return res.json({ success: false, error: `目标路径已存在: ${safePath}` });
    }
  } catch (err) {
    return res.json({ success: false, error: `检查路径失败: ${err.message}` });
  }

  // 确保父目录存在
  const parentDir = path.dirname(safePath);
  try {
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } catch (err) {
    return res.json({ success: false, error: `创建父目录失败: ${err.message}` });
  }

  // git clone（使用规范化后的路径）
  const result = await git.exec(parentDir, ['clone', url, safePath]);

  if (!result.success) {
    // 克隆失败时尝试清理可能部分创建的目录
    try { if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
    return res.json({ success: false, error: result.error || '克隆仓库失败' });
  }

  // 获取克隆后仓库的分支
  const branchResult = await git.exec(targetPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchResult.success ? branchResult.stdout : 'main';

  const repoId = toRepoId(targetPath);
  const repoInfo = {
    id: repoId,
    name: path.basename(targetPath),
    path: targetPath,
    branch
  };
  repos.set(repoId, repoInfo);

  res.json({ success: true, data: repoInfo });
});

/**
 * GET /api/repos/:repoId/config?key=user.name — 读取 git 配置
 */
router.get('/:repoId/config', async (req, res) => {
  const { repoId } = req.params;
  let repoPath;
  try { repoPath = Buffer.from(repoId, 'base64').toString('utf8'); } catch {
    return res.json({ success: false, error: '无效的 repoId' });
  }
  const key = req.query.key;
  if (!key) return res.json({ success: false, error: '缺少 key 参数' });

  const result = await git.exec(repoPath, ['config', key]);
  if (!result.success) return res.json({ success: false, error: result.error });
  res.json({ success: true, data: result.stdout });
});

/**
 * POST /api/repos/:repoId/config — 设置 git 配置
 * Body: { key, value }
 */
router.post('/:repoId/config', async (req, res) => {
  const { repoId } = req.params;
  let repoPath;
  try { repoPath = Buffer.from(repoId, 'base64').toString('utf8'); } catch {
    return res.json({ success: false, error: '无效的 repoId' });
  }
  const { key, value } = req.body;
  if (!key || value === undefined) return res.json({ success: false, error: '缺少 key/value' });

  const result = await git.exec(repoPath, ['config', key, value]);
  if (!result.success) return res.json({ success: false, error: result.error });
  res.json({ success: true, data: { key, value } });
});

/**
 * POST /api/repos/:repoId/reset — 重置到指定提交
 * Body: { hash, mode: 'soft'|'mixed'|'hard' }
 */
router.post('/:repoId/reset', async (req, res) => {
  const { repoId } = req.params;
  let repoPath;
  try { repoPath = Buffer.from(repoId, 'base64').toString('utf8'); } catch {
    return res.json({ success: false, error: '无效的 repoId' });
  }
  const { hash, mode } = req.body;
  if (!hash) return res.json({ success: false, error: '请提供目标 commit hash' });
  const resetMode = mode || 'mixed';
  const result = await git.exec(repoPath, ['reset', `--${resetMode}`, hash]);
  if (!result.success) return res.json({ success: false, error: result.error || '重置失败' });
  res.json({ success: true, data: { reset_to: hash, mode: resetMode } });
});

module.exports = router;
module.exports.repos = repos;
