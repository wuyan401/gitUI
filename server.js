/**
 * GitUI — 可视化 Git 管理工具
 * Express 主入口
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 — 托管前端
app.use(express.static(path.join(__dirname, 'frontend')));

// 引入路由模块
const reposRouter = require('./backend/routes/repos');
const branchesRouter = require('./backend/routes/branches');
const commitsRouter = require('./backend/routes/commits');
const diffRouter = require('./backend/routes/diff');
const remoteRouter = require('./backend/routes/remote');
const statusRouter = require('./backend/routes/status');

// 注册路由
app.use('/api/repos', reposRouter);
app.use('/api/repos/:repoId/branches', branchesRouter);
app.use('/api/repos/:repoId/commits', commitsRouter);
app.use('/api/repos/:repoId/diff', diffRouter);
app.use('/api/repos/:repoId/remote', remoteRouter);
app.use('/api/repos/:repoId/status', statusRouter);

// 启动服务
app.listen(PORT, () => {
  console.log(`[GitUI] 服务已启动 → http://localhost:${PORT}`);
  console.log(`[GitUI] 按 Ctrl+C 停止服务`);
});
