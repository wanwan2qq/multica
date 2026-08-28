# 桌面客户端开发环境（连自托管服务器）

开发模式下的 **Multica Canary** 通过环境变量指定后端地址，**不读取** `~/.multica/desktop.json`。改 UI 代码后热更新，适合本地调试。

打包版 / 正式安装的 Multica 才读 `desktop.json`，见 [desktop-fork-release.zh.md](./desktop-fork-release.zh.md)。

---

## 启动（连自托管 `10.15.42.27`）

```bash
cd /Users/zhoupeijun/Documents/Project/multica/apps/desktop

# 可选：先停掉旧的开发客户端
pkill -f "electron-vite.js dev" 2>/dev/null || true
pkill -f "Multica Canary" 2>/dev/null || true

# 避免 Electron 环境变量导致启动失败
launchctl unsetenv ELECTRON_RUN_AS_NODE 2>/dev/null || true
unset ELECTRON_RUN_AS_NODE

VITE_API_URL=http://10.15.42.27:8082 \
VITE_APP_URL=http://10.15.42.27:3002 \
VITE_WS_URL=ws://10.15.42.27:8082/ws \
node scripts/dev.mjs
```

启动后窗口标题一般为 **Multica Canary**（开发版），与 `/Applications/Multica.app` 正式包可同时存在，但通常只开一个。

---

## 环境变量说明

| 变量 | 示例 | 含义 |
|------|------|------|
| `VITE_API_URL` | `http://10.15.42.27:8082` | 后端 API |
| `VITE_APP_URL` | `http://10.15.42.27:3002` | Web 前端（部分页面嵌入） |
| `VITE_WS_URL` | `ws://10.15.42.27:8082/ws` | WebSocket |

服务器地址或端口变更时，改这三项后**重启**开发客户端即可。

---

## 连本地后端（可选）

若本机也跑了 `make dev` / docker compose，可把地址换成 localhost，端口与 `.env` 一致，例如：

```bash
VITE_API_URL=http://localhost:8082 \
VITE_APP_URL=http://localhost:3002 \
VITE_WS_URL=ws://localhost:8082/ws \
node scripts/dev.mjs
```

---

## 从仓库根目录启动（等价）

```bash
cd /Users/zhoupeijun/Documents/Project/multica

VITE_API_URL=http://10.15.42.27:8082 \
VITE_APP_URL=http://10.15.42.27:3002 \
VITE_WS_URL=ws://10.15.42.27:8082/ws \
pnpm dev:desktop
```

`pnpm dev:desktop` 内部会执行 `apps/desktop/scripts/dev.mjs`，并自动处理 worktree 端口隔离。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| `Cannot read properties of undefined (reading 'isPackaged')` | 执行 `unset ELECTRON_RUN_AS_NODE` 和 `launchctl unsetenv ELECTRON_RUN_AS_NODE` 后重试 |
| 改了客户端代码没生效 | 停掉旧进程后重新执行上面的启动命令 |
| 开发客户端仍连官方云 | 确认启动命令里带了 `VITE_*`；开发模式不读 `desktop.json` |
| 连不上 `10.15.42.27` | 确认服务端 `--lan` 已绑定 `0.0.0.0`，本机能 `curl http://10.15.42.27:8082/api/config` |

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [selfhost-offline-deploy.zh.md](./selfhost-offline-deploy.zh.md) | 服务端部署与 `desktop.json` |
| [desktop-fork-release.zh.md](./desktop-fork-release.zh.md) | 打包安装与 fork 自动更新 |
