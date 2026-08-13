# 架构

## 1. 需求

| 需求 | 使用者 | 要点 |
|------|--------|------|
| 展示工作区级知识库 | 人（Web / Desktop） | 目录树 + Markdown；只读浏览 |
| 知识库作为 Agent 上下文 | Agent | 按需检索，禁止整库灌入 prompt |
| 新增 / 修改知识库文件 | Agent（人审） | Git checkout → commit → push 分支 → PR |
| 不影响同步主库 | 研发 | 业务在独立包；主库只留薄挂载点 |

知识库现状：Git 管理（如 `01-贝易转/`，约 490 个文件），已有 `_overview.md` 索引。流程实例（REQ 状态、P 单队列）迁 Multica，知识产物留 Git。

## 2. 主库已有能力（优先用，不改核心）

| 能力 | 作用 | 是否够用 |
|------|------|----------|
| 工作区仓库 `workspace.repos` | 登记 Git URL；brief 列出；`multica repo checkout` | Agent 读写的主路径 |
| `workspace.context` | 每次执行注入的短系统提示 | 只放 3～5 行指针 |
| 工作区 Skill | playbook，可挂到全部 Agent | 「怎么查 / 怎么写回」 |
| Agent `mcp_config` | 外挂 MCP | 检索工具，不改主库 |
| 项目 `github_repo` / `local_directory` | 项目级执行仓 | **不要**当工作区知识库 |
| Plugin V1 | 只贡献 `agent.skill.v1`，仅官方签名包 | **不能**当知识库产品 |

工作区仓库在 brief 中的形态：

```text
## Repositories
Available in this workspace — `multica repo checkout <url> [--ref <branch-or-sha>]` ...
- <kb-git-url> — 工作区知识库（只读浏览；写入走独立分支+PR）
```

## 3. 三层架构

```
┌─────────────────────────────────────────┐
│  packages/kb 或独立 MCP（你们的包）        │
│  浏览器 UI + kb.search/read/tree         │
│  Skill 文本也可放工作区 Skill，不必进包    │
└──────────────────┬──────────────────────┘
                   │ 稳定、很窄的 host API
┌──────────────────▼──────────────────────┐
│  Multica Host（尽量上游原样）             │
│  workspace.repos / Skill / mcp_config    │
│  侧栏 + 路由槽位（Phase 2 才加）           │
└─────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Git 知识库（已有）                        │
│  _overview.md 索引 + 文档树               │
└─────────────────────────────────────────┘
```

### Layer A — 零改主库（Agent 可用）

1. 知识库 Git URL 登记为工作区仓库  
2. 工作区 Skill `workspace-knowledge` 挂到 Agent  
3. `workspace.context` 只写入口指针  
4. （可选）独立 MCP：`tree` / `search` / `read`

### Layer B — 人看的浏览器（独立包 + 薄 Host 补丁）

- `packages/views/knowledge/`：目录树 + Markdown 预览（只读）  
- Host 只加：侧栏槽位、`/{slug}/knowledge` 路由、`reserved_slugs.json` 增加 `knowledge`  
- **所有人看到的都是 Git 远程默认分支**，不是某台电脑上的 clone  
- 后端用 Git 托管 API（GitHub / Gitea / Forgejo）拉 tree 和文件，不在 Multica 里存文档副本  
- 编辑权威仍在 Git（Agent/人走分支 + PR）

### Layer C — 回馈上游的通用 Plugin 贡献（中期）

等 Plugin 支持私有源 / UI / MCP 后再做，贡献类型必须是通用的，不是 `byz.knowledge`：

- `agent.skill.contribute`  
- `agent.mcp.contribute`  
- `ui.nav.contribute`  
- `workspace.git_source.contribute`

## 4. 上下文协议（人和 Agent 共用）

知识库体量大，每次 task 禁止全量注入：

1. 先读入口 `_overview.md`（产品 / 版本目录亦然）  
2. 按任务只打开 1～3 个相关目录  
3. 引用带 Git 路径，不把长文复制进 Issue  
4. 流程状态查 Multica，不查知识库状态表  
5. 新产出写回 Git 对应目录，Issue 评论贴链接 / PR

## 5. 与产研流程的边界

| 内容 | 放哪 |
|------|------|
| REQ / P 单状态、负责人、阶段 | Multica Issue |
| PRD、技术方案、调研、FAQ、SOP | Git 知识库 |
| 「怎么查知识库 / 怎么写回」 | Skill |
| 人浏览 | 客户端知识库页（Layer B） |
| Agent 读 | checkout 或 MCP |
| Agent 写 | checkout 目录 → commit → push 分支 → PR |
