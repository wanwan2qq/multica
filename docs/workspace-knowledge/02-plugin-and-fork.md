# 插件化边界与主库同步

## 1. Plugin V1 实际能做什么

当前 Plugin V1 是 **Skill 分发管线**，不是通用插件运行时。

限制：

1. 贡献类型只有 `agent.skill.v1`  
2. 只能安装官方 `pluginbundled/` 签名包，没有 private upload  
3. UI 只有「设置 → 插件」安装 / 启停 / 绑定  
4. 不能加侧栏、不能加路由、不能声明 MCP、不能声明 Git 源

因此：**不要**把贝易转知识库打成官方 Plugin zip，也 **不要** 改 `plugincontract` 的 `DisallowUnknownFields` 去塞自定义字段。

「插件形式」在本方案中的含义：

- 知识库业务代码在独立包 / 独立 MCP 进程  
- Multica 只提供已有扩展点 + 极薄槽位  
- 将来上游若增加通用贡献类型，再把独立包收成真正插件

## 2. 允许改主库的挂载点（Phase 2）

全部用注释 `// BYZ-KB-HOOK`（或 `KB-HOOK`）标出，方便 rebase。

| 文件 | 改动量 | 作用 |
|------|--------|------|
| **新建** `packages/views/layout/plugin-nav-items.ts` | ~20 行 | 导出额外侧栏项 |
| `packages/views/layout/app-sidebar.tsx` | ~5 行 | concat 上述列表 |
| Web / Desktop 各加 `/{slug}/knowledge` | 平台接线 | 渲染 `packages/kb` |
| `server/internal/handler/reserved_slugs.json` + `pnpm generate:reserved-slugs` | 1 个词 `knowledge` | 避免与工作区 slug 冲突 |

**禁止**为知识库修改：

- `server/internal/daemon/execenv` brief  
- Issue / Project schema  
- `server/pkg/plugincontract`  
- `server/internal/pluginbundled/`

## 3. 代码放哪

```
packages/kb/                    # 新建，主库没有这个包 → rebase 几乎不撞
  browser/                      # 目录树 + Markdown
  git-client.ts                 # 读本地 clone / daemon 文件 API
  index.ts

# 可选独立进程，甚至可以不在本 monorepo
kb-mcp/                         # search / read / tree，只读
```

Skill 文本优先作为 **工作区 Skill** 在运行时的 Multica 里创建（见 `05-skill.md`），不必进 git 主库。若要版本化，可放在知识库 Git 仓，例如 `99-团队共享/skills/workspace-knowledge/SKILL.md`，再导入 Multica。

## 4. 同步主库的操作

本地 remote：

- `origin` → `https://github.com/wanwan2qq/multica.git`  
- `upstream` → `https://github.com/multica-ai/multica.git`

```bash
git fetch upstream
git rebase upstream/main
# 若冲突，优先只会出现在 app-sidebar.tsx / reserved_slugs.json
```

约定：

1. 知识库相关提交前缀：`feat(kb):` / `docs(kb):`  
2. Host 槽位单独一个 commit，方便 cherry-pick  
3. 定期 rebase，不要长期分叉 `execenv` / Plugin V1  
4. 路由用单段 `knowledge`，符合仓库约定（不要 `/workspace-knowledge` 这种根级连字符路由）

## 5. 与「回馈上游」的关系

若要减少永久 fork 补丁，可向上游提通用能力（不是贝易转业务）：

```json
{
  "requested_capabilities": [
    "agent.skill.contribute",
    "agent.mcp.contribute",
    "ui.nav.contribute",
    "workspace.git_source.contribute"
  ]
}
```

在上游落地并支持私有插件源之前，本方案 Layer A + 独立包即可上线。
