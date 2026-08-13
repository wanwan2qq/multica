# 工作区知识库方案

工作区级 Git 知识库接入 Multica：人在客户端浏览，Agent 按需检索并允许按 Git 流程新增/修改文件。设计目标是**尽量插件化**，少改主库，方便后续同步 `upstream/multica-ai/multica`。

## 核心原则

| 层 | 职责 | 权威 |
|----|------|------|
| Git 知识库 | What & How：文档、模板、SOP、调研、PRD、技术方案 | 文档内容 |
| Multica | Who & When & Where：Issue 状态、负责人、Agent 执行 | 流程状态 |
| 飞书 | 入口与通知 | 不是状态源 |

**Multica 不为知识库做第二份副本。** Agent 读/写都落在 Git 仓库上。

## 文档

| 文件 | 内容 |
|------|------|
| [01-architecture.md](01-architecture.md) | 需求拆解、主库现有能力、三层架构 |
| [02-plugin-and-fork.md](02-plugin-and-fork.md) | Plugin V1 边界、Host 挂载点、同步策略 |
| [03-agent-read-write.md](03-agent-read-write.md) | Agent 如何读、如何新增/修改文件 |
| [04-execution.md](04-execution.md) | 分阶段执行步骤与验收 |
| [05-skill.md](05-skill.md) | 工作区 Skill `workspace-knowledge` 草案 |
| [06-mcp-contract.md](06-mcp-contract.md) | MCP 工具契约（只读） |

相关：团队产研流程落地方案在知识库  
`01-贝易转/02-研发过程/Multica产研流程落地方案.md`。

## 一句话架构

```
Git 远程（默认分支）──Git API──► 客户端只读浏览（所有成员同一份）
Git 远程 ──checkout──► Agent 读写（独立分支 + PR）
Git clone（运行时本机）──MCP──► Agent 检索（只读，不给别人看）
```

## 不要做

- 把知识库全文灌进 prompt / `workspace.context`
- 用 Plugin V1 官方 catalog 分发贝易转知识库（无私有上传、无 UI 贡献）
- 第一期做 pgvector RAG
- 用 MCP 写文件
- 让 Agent 改知识库里的流程状态表（`_overview.md` 状态列、`queue.md`）
- 把业务逻辑打进 `app-sidebar.tsx` / `execenv` / `pluginbundled/`
