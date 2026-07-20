/**
 * Git 命令封装层
 * 使用 child_process.execFile 调用系统 git 命令
 */

const { execFile } = require('child_process');

/**
 * 执行 git 命令
 * @param {string} cwd - 仓库工作目录
 * @param {string[]} args - git 命令参数
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, error?: string}>}
 */
function exec(cwd, args) {
  return new Promise((resolve) => {
    // execFile 直接传递参数给进程，不经过 shell，天然防注入
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        // 非零退出码不抛异常，统一返回格式
        resolve({
          success: false,
          error: (stderr || error.message || '').trim(),
          stdout: stdout ? stdout.trim() : '',
          stderr: stderr ? stderr.trim() : ''
        });
        return;
      }
      resolve({
        success: true,
        stdout: stdout ? stdout.trim() : '',
        stderr: stderr ? stderr.trim() : ''
      });
    });
  });
}

/**
 * 解析 git status --porcelain 输出
 * @param {string} output - git status --porcelain 的原始输出
 * @returns {{staged: Array<{status: string, name: string}>, modified: Array<{status: string, name: string}>, untracked: Array<{status: string, name: string}>}}
 */
function parseStatusPorcelain(output) {
  const staged = [];
  const modified = [];
  const untracked = [];

  if (!output) return { staged, modified, untracked };

  const lines = output.split('\n').filter(Boolean);
  for (const line of lines) {
    if (line.length < 3) continue;

    const statusX = line[0]; // 暂存区状态
    const statusY = line[1]; // 工作区状态
    const name = line.slice(3).trim();

    // 未跟踪文件
    if (statusX === '?' && statusY === '?') {
      untracked.push({ status: '??', name });
      continue;
    }

    // 暂存区有变更
    if (statusX !== ' ' && statusX !== '?') {
      staged.push({ status: statusX, name });
    }

    // 工作区有变更
    if (statusY !== ' ' && statusY !== '?') {
      modified.push({ status: statusY, name });
    }

    // 同时出现在暂存区和工作区的文件（如修改后暂存又修改）
    // staged 和 modified 各记录一条
  }

  return { staged, modified, untracked };
}

/**
 * 解析远程仓库列表
 * @param {string} output - git remote -v 输出
 * @returns {Array<{name: string, fetch: string, push: string}>}
 */
function parseRemotes(output) {
  if (!output) return [];
  const remotes = {};
  const lines = output.split('\n').filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0];
    const url = parts[1];
    const type = parts.length > 2 ? parts[2].replace(/[()]/g, '') : '';
    if (!remotes[name]) remotes[name] = { name };
    if (type === 'fetch') remotes[name].fetch = url;
    if (type === 'push') remotes[name].push = url;
  }
  return Object.values(remotes);
}

module.exports = {
  exec,
  parseStatusPorcelain,
  parseRemotes
};
