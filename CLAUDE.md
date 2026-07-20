# GitUI — 可视化 Git 管理工具

纯前端 Web UI + Node.js Express 后端，通过 child_process 调用 git 命令。

## 技术栈
- 后端：Node.js + Express，通过 `child_process.exec` 调用系统 git
- 前端：纯 HTML/CSS/JS，零框架依赖
- 样式：CSS 变量主题系统（亮色+暗色）
- 通信：REST API (JSON) + Server-Sent Events (实时进度)

## 项目结构
```
git-ui/
├── package.json
├── server.js              # 入口：启动 Express + 静态文件服务
├── CLAUDE.md
├── backend/
│   ├── git.js             # Git 命令封装层
│   └── routes/
│       ├── repos.js       # 仓库列表/打开/初始化
│       ├── branches.js    # 分支 CRUD
│       ├── commits.js     # 提交历史/详情
│       ├── diff.js        # Diff 查看
│       ├── remote.js      # Remote 管理 + push/pull/fetch
│       └── status.js      # 工作区状态
├── frontend/
│   ├── index.html         # SPA 入口
│   ├── css/
│   │   ├── main.css       # 全局 + 布局
│   │   └── themes/
│   │       ├── light.css
│   │       └── dark.css
│   └── js/
│       ├── app.js         # 入口：初始化、路由、API 封装
│       ├── router.js      # Hash 路由
│       ├── theme.js       # 主题管理
│       └── modules/
│           ├── dashboard.js    # 仓库概览面板
│           ├── branches.js     # 分支管理面板
│           ├── history.js      # 提交历史（含图形化分支线）
│           ├── diff.js         # Diff 查看器
│           ├── remote.js       # 远程操作面板
│           ├── settings.js     # 设置面板
│           └── clone.js        # 克隆仓库面板
```

## 前端设计规范
- 布局：顶部导航栏 48px + 左侧面板切换 200px + 右侧内容区
- 配色：明亮清新风格，微渐变背景 + 玻璃卡片
- CSS 变量：`--bg, --surface, --text, --accent, --border, --radius, --shadow`
- 每个模块导出：`{ id, name, icon, init(container), cleanup() }`
- 所有 API 调用通过 `api.get('/xxx')` / `api.post('/xxx', data)` 封装

## 后端 API 设计
所有 API 返回 `{ success: boolean, data?: any, error?: string }`

### 仓库管理 `/api/repos`
- `GET /api/repos` — 列出已保存的仓库
- `POST /api/repos/open` — 打开本地仓库 `{ path }`
- `POST /api/repos/init` — 初始化新仓库 `{ path }`

### 分支 `/api/repos/:repoId/branches`
- `GET` — 列出所有分支（本地+远程）
- `POST` — 创建分支 `{ name, from? }`
- `PUT /switch` — 切换分支 `{ name }`
- `DELETE` — 删除分支 `{ name, force? }`
- `POST /merge` — 合并分支 `{ from }`

### 提交 `/api/repos/:repoId/commits`
- `GET` — 提交历史 `?branch=&limit=50&skip=0`
- `GET /:hash` — 单个提交详情
- `POST` — 创建提交 `{ message, files? }`

### Diff `/api/repos/:repoId/diff`
- `GET` — 工作区未暂存 diff
- `GET /staged` — 暂存区 diff
- `GET /:hash` — 指定提交 diff

### 远程 `/api/repos/:repoId/remote`
- `GET` — 列出远程仓库
- `POST /add` — 添加远程 `{ name, url }`
- `POST /push` — 推送 `{ remote, branch, force? }`
- `POST /pull` — 拉取 `{ remote, branch }`
- `POST /fetch` — 获取 `{ remote }`

### 状态 `/api/repos/:repoId/status`
- `GET` — 工作区状态（修改/暂存/未跟踪）
- `POST /stage` — 暂存文件 `{ files[] }`
- `POST /unstage` — 取消暂存 `{ files[] }`

## 安全注意事项
- 所有 git 命令参数必须用引号包裹防止注入
- repoId 使用 base64 编码的路径
- 敏感操作（force push、hard reset）需要二次确认

## 视觉风格
- 亮色主题：温暖微渐变背景 + 低透明度彩色光斑
- 暗色主题：深色底 + 微妙渐变
- 卡片：玻璃效果 + 彩色顶边
- 分支图：Canvas 绘制，彩色线条
- Diff：类 GitHub 风格，绿色添加/红色删除
