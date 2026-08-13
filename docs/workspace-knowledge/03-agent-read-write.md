# Agent 读与写

## 1. 读

两条路径，可同时开：

| 路径 | 机制 | 改主库 |
|------|------|--------|
| Checkout 后自己读文件 | `multica repo checkout <kb-url>`，再读 `_overview.md` / 目标 md | 无 |
| MCP 检索 | `kb.tree` / `kb.search` / `kb.read` | 无（配 `mcp_config`） |

`workspace.context` 只放指针，例如：

```text
工作区知识库：<git-url>
入口：01-贝易转/_overview.md
流程状态以 Multica Issue 为准；不要改知识库里的状态表。
写回走独立分支 + PR，不要直推 main。
```

## 2. 写（新增 / 修改文件）

**可以写。** 与改业务代码仓同一条 Git 路径，不走 MCP，不走 Multica 文档 API。

```
1. multica repo checkout <知识库 git url>
   → daemon 拉独立 worktree，切到专用分支（通常 agent/<agent>/<task>）
2. 在 checkout 目录新建或修改 .md
3. git add && git commit（message 带 REQ / P 编号）
4. git push（使用 daemon 所在机器上的 Git 凭证）
5. 开 PR，或按团队约定请人合进默认分支
6. Issue 评论贴：Git 路径、分支名、PR 链接
```

`multica repo checkout` 会创建专用分支；stage/commit 在 task 工作目录完成，共享 bare clone 缓存不会被直接写坏。

### 能否 push

| 步骤 | 条件 |
|------|------|
| checkout + 本地编辑 | 知识库 URL 已在工作区仓库列表 |
| git push | 该运行时机器已配置 Git 凭证（`gh` / SSH / credential helper），且远端授权该账号 |
| 合进 main | 取决于保护分支；禁止直推时只能推 Agent 分支再开 PR |

自托管时：保证跑 Agent 的机器对知识库仓有 push 权限即可。

## 3. MCP 保持只读

第一期 MCP **不得**提供 `write` / `commit` / `push`。  
写入走 Git，避免在 Git 之外再做一套文件 API。

## 4. 写入白名单 / 黑名单

写进 Skill，人和 Agent 共用。

**允许**

- 新建调研纪要、技术方案、FAQ、SOP 草稿  
- 按模板补 PRD / 测试报告 / 客服文档  
- 更新该任务点名的已有文档  
- 在对应目录 `_overview.md` 增加**链接**（不是改状态列）  
- 推到当前 checkout 分支并开 PR  

**禁止**

- 改需求池 `_overview.md` 的状态 / 负责人 / 版本列  
- 改 `00-任务队列/queue.md` 等流程状态  
- 删除他人文档、改 Git 历史、force push、直推 `main`  
- 把长文复制进 Issue 当作归档  
- 一次改多个无关目录  

## 5. 客户端展示 vs Agent 写入

| 表面 | 行为 |
|------|------|
| Web / Desktop 知识库页 | **只读 Git 远程默认分支**。张三有无 clone 不影响李四看到的内容 |
| Agent | 在独立分支上写，合进默认分支后所有人的客户端才能看到 |
| 本机 clone | 只给这台机器上的 Agent / MCP 用，不是工作区浏览数据源 |

## 6. 小结

| 能力 | 本方案 |
|------|--------|
| Agent 读 | ✅ checkout 或 MCP |
| Agent 新增 / 修改文件 | ✅ checkout 目录 → commit → push 分支 |
| Agent 经 MCP 写 | ❌ 第一期不做 |
| Multica 内文档副本 | ❌ 没有副本，权威在 Git |
| 合进主分支 | ⚠️ 分支 + PR + 保护规则 |
