# MCP 契约（只读）

独立进程，挂到 Agent `mcp_config`。根目录 = 知识库 clone（由运行时机器维护 `git fetch`）。

第一期 **只有读工具**。写入见 `03-agent-read-write.md`。

## 工具

### `kb.tree`

列出目录（相对知识库根）。

输入：

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 相对路径，默认 `"."` |
| `depth` | number | 最大深度，默认 `2`，上限 `4` |

输出：缩进文本或 `{ path, type: "dir"|"file" }[]`。  
跳过 `.git`、`node_modules`、二进制常见目录。

### `kb.search`

按关键字搜 Markdown / 文本。

输入：

| 字段 | 类型 | 说明 |
|------|------|------|
| `query` | string | 必填 |
| `path` | string | 可选，限制子树 |
| `max_results` | number | 默认 `20`，上限 `50` |

输出：`{ path, line, snippet }[]`。

### `kb.read`

读单个文本文件。

输入：

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 相对路径，必填 |
| `max_bytes` | number | 默认 `64KiB`，上限 `256KiB` |

若超过 `max_bytes`：返回文件头 + 提示用更小范围或 `search`。  
拒绝路径穿越（`..`）、绝对路径、`.git/`。  
非 UTF-8 / 明显二进制：错误，不返回原文。

## 明确不提供

- `kb.write` / `kb.delete` / `kb.commit` / `kb.push`  
- 任意 shell  
- 把检索结果自动写进 Multica Issue

## Agent 配置示例

```json
{
  "mcpServers": {
    "workspace-kb": {
      "command": "kb-mcp",
      "args": ["--root", "/path/to/team-knowledge-clone"]
    }
  }
}
```

路径按各运行时本机 clone 调整。不要把知识库内容打进 Multica 镜像。

## 实现位置建议

放在 **本 monorepo 之外** 或 `packages/kb-mcp/`（若放 monorepo，不要改 `server/`）。  
语言不限；与主库无编译依赖，rebase 无冲突。
