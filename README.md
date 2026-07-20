# 🐙 GitUI — 可视化 Git 管理工具

纯前端 + Node.js 的 Git 图形化管理工具，无需安装任何 Git GUI 软件，在浏览器中完成分支管理、提交、回滚、远程同步等操作。

## ✨ 功能

| 面板 | 功能 |
|------|------|
| 🏠 概览 | 仓库信息、工作区状态（暂存/取消/删除文件）、快速提交到本地或推送 |
| 🌿 分支 | 本地/远程分支列表，切换、创建、合并、删除 |
| 📜 历史 | Canvas 分支图 + 时间线、分页、点击展开详情、回滚/重置 |
| 📊 差异 | 工作区/暂存区 diff，文件列表，GitHub 风格高亮 |
| ☁️ 远程 | 远程仓库列表、添加/删除、推送/拉取、操作日志、从远程恢复文件 |
| 📥 克隆 | URL 输入克隆、热门模板、进度显示 |
| ⚙ 设置 | 主题切换、Git 用户配置、克隆路径、仓库管理 |

## 🚀 快速开始

```bash
# 1. 安装依赖
cd git-ui
npm install

# 2. 启动
双击 start.bat
# 或
node server.js

# 3. 打开浏览器
http://localhost:3002
```

## 🏗️ 技术栈

- **后端**: Node.js + Express，通过 `child_process.execFile` 调用 Git 命令
- **前端**: 原生 HTML/CSS/JS，零框架依赖，插件式面板架构
- **样式**: CSS 变量主题系统，支持亮色/暗色切换

## 📁 项目结构

```
git-ui/
├── server.js                 # Express 入口
├── start.bat                 # Windows 一键启动
├── backend/
│   ├── git.js                # Git 命令封装
│   └── routes/               # API 路由
│       ├── branches.js       # 分支 CRUD
│       ├── commits.js        # 提交历史/回滚
│       ├── diff.js           # Diff 查看
│       ├── remote.js         # 远程操作/恢复
│       ├── repos.js          # 仓库管理/克隆/config
│       └── status.js         # 工作区状态/暂存/删除
└── frontend/
    ├── index.html            # SPA 入口
    ├── css/                  # 样式 + 主题
    └── js/
        ├── app.js            # 全局状态/API/事件总线
        ├── router.js         # Hash 路由
        ├── theme.js          # 主题管理
        └── modules/          # 7 个功能面板
```

## ⚠ 注意事项

- 需要系统已安装 Git 和 Node.js
- 推送远程仓库前需配置 GitHub SSH Key 或 Token
- 拉取只下载远程新变更，文件丢失请用「从远程恢复」
