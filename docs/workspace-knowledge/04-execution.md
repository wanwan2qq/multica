# 执行步骤

按阶段做。前一阶段验收通过再进入下一阶段。Layer A 不改 Multica 代码。

---

## Phase 0 — 配置（0 代码）

目标：Agent 能 checkout 知识库、读入口、在 Issue 里引用路径。

### 步骤

1. **确认知识库 Git 远程 URL**（内网 Git / GitHub / Gitea 等），以及跑 Agent 的机器已经 `git clone` / `git fetch` 成功。  
2. 打开 Multica 工作区 → **设置 → 代码仓库** → 添加该 URL。  
   - description：`工作区知识库。入口 01-贝易转/_overview.md。写入走独立分支+PR。`  
   - CLI 等价：`multica repo add <url> --description "..."`  
3. **设置 → 工作区** → `workspace.context` 写入指针（见 `03-agent-read-write.md`）。  
4. 创建工作区 Skill `workspace-knowledge`，内容用 `05-skill.md`。  
5. 将该 Skill 绑定到 PRD / DEV / TEST（及 PMO）Agent。  
6. 确认运行时机器对知识库仓的 **fetch 权限**；若 Phase 0 只读，push 可稍后配。

### 验收

- [ ] 工作区仓库列表能看到知识库 URL  
- [ ] 派一个试验 Issue 给 Agent：「阅读知识库入口并列出 02-研发过程 下的版本目录」  
- [ ] Agent 执行日志里出现 `multica repo checkout <url>`  
- [ ] 评论中引用了 `_overview.md` 路径，且没有把整库贴进评论  
- [ ] 没有改 Multica 源码

---

## Phase 1 — 只读 MCP（0 主库代码）

目标：检索工具化，限制文件数与大小。

### 步骤

1. 实现独立进程 MCP，工具契约见 `06-mcp-contract.md`。  
2. MCP 的根目录指向知识库 clone（daemon 机器上的固定路径，或每次从 bare cache 更新）。  
3. 在 Agent 的 `mcp_config` 中挂上该 server。  
4. Skill 中补充：优先 `kb.search` / `kb.read`；需要写文件时再 checkout。

### 验收

- [ ] `kb.tree` 能列出 `01-贝易转/` 第一层  
- [ ] `kb.search` 能搜到「收银台」等相关文档路径  
- [ ] `kb.read` 拒绝超大文件 / 二进制  
- [ ] 没有 `write` 工具  
- [ ] 试验 Issue：Agent 用 MCP 读一篇 PRD 并摘要，Issue 里只留路径

---

## Phase 2 — Agent 写入（仍可不改主库）

目标：Agent 能新增/修改 md，推到专用分支。

### 步骤

1. 为运行时机器配置知识库仓的 **push 凭证**。  
2. 远端设置：默认分支保护，禁止直推 `main`。  
3. Skill 已含写入白名单（`05-skill.md`）。  
4. 试验任务：「在 `01-贝易转/99-日常处理/` 新增一篇试验纪要，提交并 push 当前分支，在 Issue 贴路径和分支名」。  
5. 人审 diff，合进默认分支或丢弃。

### 验收

- [ ] checkout 落在 `agent/<name>/<task>` 一类分支，不是 `main`  
- [ ] 新文件在正确目录  
- [ ] commit message 含 Issue / REQ 编号  
- [ ] 未 force push、未改 `queue.md` / 需求池状态表  
- [ ] Issue 评论有路径 + 分支（或 PR）  
- [ ] 合进默认分支后，本机 `git pull` 能看到该文件

---

## Phase 3 — 客户端只读浏览（独立包 + 薄槽位）

目标：Web/Desktop 侧栏有「知识库」，可浏览目录和 Markdown。

### 步骤

1. 新建 `packages/views/knowledge/`（目录树 + Markdown 预览，只读）。  
2. 新建 `packages/views/layout/plugin-nav-items.ts`，导出知识库导航项。  
3. `app-sidebar.tsx` concat 该列表（`KB-HOOK` 注释）。  
4. `reserved_slugs.json` 增加 `knowledge`，执行 `pnpm generate:reserved-slugs`。  
5. Web / Desktop 增加 `/{slug}/knowledge`。  
6. 后端 `GET .../knowledge/tree` 与 `.../knowledge/file` 读 **Git 远程默认分支**（GitHub / Gitea / Forgejo API）。不 clone 到 Multica 服务器，也不读任何成员本机。

### 验收

- [ ] 侧栏出现「知识库」，进入后能看到 `_overview.md` 导航  
- [ ] 点击 md 能预览  
- [ ] 页面无编辑保存按钮  
- [ ] rebase `upstream/main` 时冲突（若有）仅在 sidebar / reserved-slugs  
- [ ] `pnpm typecheck` 针对改动范围通过

---

## Phase 4 — 可选：回馈上游 / 真插件

仅当 Plugin 支持私有源与 `ui.nav` / `agent.mcp` 贡献后再做。见 `02-plugin-and-fork.md`。

---

## 推荐顺序（7 人团队）

```
Phase 0（1～2 天）→ Phase 2 写入试验（可与 Phase 1 并行）
                → Phase 1 MCP（体验更好再做）
                → Phase 3 浏览页（人真的需要在 Multica 里看再做）
```

不必等 Plugin V1 扩展。Agent 读写在 Phase 0～2 即可上线。

---

## 回滚

| 阶段 | 回滚 |
|------|------|
| 0 | 从工作区仓库移除 URL；停用 Skill；清空 context 中的知识库段 |
| 1 | Agent 去掉 mcp_config；停 MCP 进程 |
| 2 | 远端保护分支保持；删除 Agent 分支 |
| 3 | 去掉侧栏槽位与路由；删 `packages/kb` |
