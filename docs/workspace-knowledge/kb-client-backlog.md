# 知识库客户端 — 后续优化待办

> 记录 fork 知识库浏览器的客户端改进 backlog。已完成项见 git history；kb6 做内链 + 浏览后退。

## P1 — 体验

| 项 | 说明 |
|----|------|
| **文件 prefetch** | 树/目录列表 hover 或 focus 时 prefetch `knowledgeFileOptions`，减少点开 Markdown 的等待 |
| **树 filter debounce** | 侧栏过滤 150–200ms debounce；`buildTree` 与 filter 解耦 memo，大树更顺 |
| **最近打开** | 除「上次文件」外，记录最近 N 个路径，侧栏或命令面板快速回访 |

## P2 — 内容与导航

| 项 | 说明 |
|----|------|
| **Markdown 图片** | 支持 `![…](./img.png)`；需 server raw 代理或改写为带 ref+path 的 API URL |
| **标题锚点** | 保留 `#fragment`；RichContent heading 注入 id，支持 `?path=doc.md#section` 页内滚动 |
| **目录列表 polish** | 右键复制、上级目录快捷入口、排序切换 |

## P3 — 性能与平台

| 项 | 说明 |
|----|------|
| **大树虚拟化** | `KnowledgeTree` windowing（如 `@tanstack/react-virtual`），>500 文件时必要 |
| **query 缓存** | tree `staleTime` 5–10min + 切分支 `placeholderData`，减少 Git API |
| **窄屏 / 平板** | `<md` 时树改 Drawer，正文全宽 |
| **分支 picker** | 使用 `branch_load_failed` 文案；GitHub 分支 >100 时分页 |

## P3 — 质量

| 项 | 说明 |
|----|------|
| **i18n** | 补 `directory_item_count_one` 等 plural；树折叠 aria 改 i18n |
| **HTML 预览** | iframe 加 `sandbox` 或展示 `html_sandbox_notice` |
| **安装/刷新错误** | load error 态加 Retry；copy 失败 toast |
| **重复代码** | 合并 tree / directory listing 的 `fileIconForName` |

## 已知限制（文档向）

- 单文件预览上限 256KB（server）
- GitHub recursive tree 有规模上限，超大 repo 可能截断
- 自动更新：macOS kb5+ 用 `update.zip` ditto，须装在 `/Applications/Multica.app`
- 仅 web + desktop 共用 `KnowledgePage`；mobile 未实现
