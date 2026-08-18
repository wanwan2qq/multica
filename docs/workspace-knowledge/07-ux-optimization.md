# UX 优化

Phase 3 知识库浏览页面的交互与视觉优化。全部改动在 `packages/views/knowledge/` 内，不触碰上游文件。

## 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/views/knowledge/knowledge-tree.tsx` | 新增 | 知识库专属树组件，替换通用 `FileTree` |
| `packages/views/knowledge/knowledge-tree.test.tsx` | 新增 | 树组件测试（8 个用例） |
| `packages/views/knowledge/resolve-links.ts` | 新增 | Markdown 链接改写，相对路径 → `?path=` URL |
| `packages/views/knowledge/resolve-links.test.ts` | 新增 | 链接改写测试（11 个用例） |
| `packages/views/knowledge/knowledge-page.tsx` | 修改 | 替换 FileTree、添加面包屑、应用链接改写 |
| `packages/views/knowledge/knowledge-page.test.tsx` | 修改 | 适配新组件 |
| `packages/views/locales/{en,zh-Hans,ja,ko}/knowledge.json` | 修改 | 新增 4 个 i18n key |

## 1. 树结构 — KnowledgeTree 组件

### 文件类型图标（6 种 × 颜色）

| 类型 | 扩展名 | 图标 | 颜色 |
|------|--------|------|------|
| Markdown | `.md` `.mdx` | `FileText` | sky-500 |
| 代码 | `.js` `.ts` `.tsx` `.go` `.py` `.rs` 等 | `FileCode` | violet-500 |
| 配置 | `.json` `.yaml` `.yml` `.toml` `.xml` `.env` | `Braces` | amber-500 |
| 图片 | `.png` `.jpg` `.gif` `.svg` `.webp` `.ico` | `Image` | emerald-500 |
| 样式 | `.css` `.scss` `.less` | `Palette` | pink-500 |
| 通用 | 其他 | `File` | muted-foreground |

### 文件夹

- 琥珀色图标（`text-amber-500`）
- 展开态 `FolderOpen` / 折叠态 `Folder`
- 右侧显示子项数量徽章

### 全部展开/折叠

- 树面板顶部切换按钮（`ChevronsDownUp` / `ChevronsUpDown`）
- 初始状态全部展开

### 扩展名徽章

- 文件名右侧显示 `.md`、`.json` 等小标签
- 颜色与文件类型图标对应

### 树缩进

- 每级 12px（原通用 FileTree 为 8px）

## 2. 文档样式 — 面包屑

内容区顶部新增 `KnowledgeBreadcrumb` 组件：

- 展示当前文件路径（如 `01-贝易转 / 02-研发过程 / README.md`）
- 每段可点击跳转到对应目录
- 末段为当前文件名，不可点击

## 3. 文档内链接跳转 — resolveKnowledgeLinks

`RichContent` 渲染前对 Markdown 字符串做预处理：

```
[PRD](./PRD.md)          →  [PRD](?path=01-贝易转/02-研发过程/PRD.md)
[SOP](../sop.md)         →  [SOP](?path=01-贝易转/sop.md)
[Root](/README.md)       →  [Root](?path=README.md)
[ref]: ./doc.md          →  [ref]: ?path=01-贝易转/doc.md
```

### 处理规则

| 链接类型 | 行为 |
|---------|------|
| 相对路径（`./` `../`） | 解析为知识库页面 URL |
| 绝对路径（`/` 开头） | 相对于仓库根解析 |
| 外部 URL（`https://` `mailto:` 等） | 保持不变 |
| 锚点链接（`#heading`） | 保持不变 |
| 图片链接（`![alt](url)`） | 保持不变 |
| 引用式链接定义（`[ref]: url`） | 同样处理 |
| 片段（`#heading`） | 剥离 |

## 4. i18n 新增 key

| Key | en | zh-Hans | ja | ko |
|-----|-----|---------|-----|-----|
| `page.tree_title` | Files | 文件 | ファイル | 파일 |
| `page.expand_all` | Expand all | 全部展开 | すべて展開 | 모두 펼치기 |
| `page.collapse_all` | Collapse all | 全部折叠 | すべて折りたたむ | 모두 접기 |
| `page.breadcrumb_aria` | File path | 文件路径 | ファイルパス | 파일 경로 |

## 不改动的部分

- `packages/views/skills/components/file-tree.tsx` — 通用组件保持不变
- `packages/views/rich-content/` — 不改动，链接改写在 Markdown 字符串层面完成
- `packages/core/knowledge/` — 类型和查询不变
- 后端 — 无改动

## 上游同步影响

**零影响。** 本次优化所有改动均在 `packages/views/knowledge/` 目录内，该目录在上游不存在。没有新增任何 KB-HOOK 补丁到上游文件。后续 rebase 不会产生冲突。