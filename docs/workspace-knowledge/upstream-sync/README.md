# 上游同步记录

每次 rebase upstream/main 后记录，用于复盘冲突和跟踪上游变化。

格式：日期、上游版本范围、commit 数量、冲突文件、处理方式。

---

## 2026-08-18 — v0.4.25 → v0.4.28

- **范围**：`v0.4.25..v0.4.28`（74 commits）
- **上游版本**：v0.4.25 → v0.4.26 → v0.4.27 → v0.4.28
- **冲突文件**（2 个）：

| 文件 | 冲突原因 | 处理 |
|------|---------|------|
| `packages/core/api/schemas.ts` | 上游新增 `WorkspaceMcpServer`/`ShareLink`/`JoinShareLink` 等 schema，与我们的 `KnowledgeTree`/`KnowledgeFile` schema 都在文件末尾 | 保留两边，KB schema 加 `KB-HOOK` 注释 |
| `packages/core/api/schemas.test.ts` | 上游新增 issue status catalog 测试，与我们的 knowledge schema 测试 | 保留两边测试块 |

- **KB-HOOK 补丁验证**：`app-sidebar.tsx` 中 `pluginWorkspaceNavItems` 正确应用到新版 `workspaceNav` 数组；`router.go` 中 knowledge 路由正确挂载
- **推送问题**：HTTPS OAuth 无权写 `.github/workflows/ci.yml`，改用 SSH push

## 2026-08-18 — 待同步（3 commits）

当前 upstream/main 领先 3 个 commit：

| Commit | 日期 | 说明 |
|--------|------|------|
| `0b9dcc679` | 2026-08-18 | fix(agent): preserve Pi RPC stdin on Windows |
| `d6301091e` | 2026-08-18 | fix(agent tasks): stop NUL bytes wedging tasks |
| `3dc87b669` | 2026-08-18 | fix(agent tasks): sanitize failure diagnostics |

**影响评估**：3 个都是 agent/daemon 修复，不涉及 KB 相关文件，预计无冲突。