# 知识库引用 `[[路径]]` 可点击 — 交接与排查文档

> 目的：把 `[[路径]]`（Obsidian/wiki 式）在**任务描述 + 任务回复/评论**正文里渲染成可点击链接，点击跳到 `/ {slug}/knowledge?path=…`。纯前端，不改后端/DB/接口。
>
> 本文档写给接手排查的 Agent：**核心逻辑已实现且单测通过，但运行的 Desktop dev 窗口仍显示纯文本 `[[…]]`，需要定位"渲染进程为何没执行已补丁代码"。**

## 已确认的事实（不要重复实现）

### 1. 核心转换逻辑已验证正确
`packages/ui/markdown/knowledge-links.ts` → `preprocessKnowledgeLinks(md)` 把 `[[X]]` 重写为 `[X](kb:encodeURIComponent(X))`，复用 `./linkify` 的 `findCodeRanges`/`findMarkdownLinkRanges`/`detectLinks`/`isInsideCode`/`rangesOverlap` 跳过 code/已有链接/URL/路径。纯函数、无 workspace/API 依赖。

**已用真实 CJK 长路径单测验证：**
```
详见知识库文档 [[01-贝易转/…/链家业务迁移至贝易转Pro需求分析.md]]
```
转换输出：
```
详见知识库文档 [01-贝易转/…/需求分析.md](kb:01-%E8%B4%9D…md)
```

### 2. 两条渲染面均已补丁
| 表面 | 组件 | 补丁位置 |
|------|------|---------|
| 评论/回复/只读正文 | `ReadonlyContent` → `RichContent` | `packages/views/rich-content/rich-content.tsx:524` — `preprocessMarkdown(preprocessKnowledgeLinks(content), {…})` |
| 任务描述（编辑） | `ContentEditor` | `packages/views/issues/components/issue-detail.tsx:3063` — `value={preprocessKnowledgeLinks(issue.description)}` |

> 关键：**评论和任务描述只读视图都用 `ReadonlyContent`（`packages/views/editor/readonly-content.tsx`），它只是 `RichContent` 的薄封装**。所以补丁打在 `RichContent` 一处即覆盖两者。（rich-content-parity.test.tsx 明确注明 "Comment and Issue description share ReadonlyContent"）

### 3. 点击分发已验证
- `openLink()` 顶部 `kb:` 分支 → `/knowledge?path=<encoded>`（`packages/views/editor/utils/link-handler.ts:265`）。
- 无 slug 时按 pathname 匹配补当前 slug：`(path.split("/")[1] ?? "").split(/[?#]/)[0]`（修复了 `/knowledge?path=x` 漏掉 `knowledge` 段的 bug）。
- Tiptap Link 扩展加 `protocols: ["kb"]`（`packages/views/editor/extensions/index.ts:74`），否则 `isAllowedUri` 否决 `kb:` → 渲染 `<a href="">` 死链。
- 新增 `KnowledgeLinkInputRule`（`packages/views/editor/extensions/knowledge-link-input-rule.ts`），边打字边把 `[[X]]` 转 `kb:` 链接。
- sanitize 白名单加 `kb` 协议（`packages/ui/markdown/sanitize.ts`）。

### 4. 单测状态（全绿）
- `packages/views/knowledge/knowledge-links.test.ts` — 纯转换矩阵。
- `packages/views/editor/extensions/knowledge-link-input-rule.test.ts` — InputRule + mount 解析。
- `packages/views/editor/utils/link-handler.test.ts` — `kb:` 路由。
- `packages/views/rich-content/app-url-link-routing.test.tsx` — `[[docs/foo.md]]` → `<a href="kb:…">` + 点击导航。
- `packages/views/common/rich-content-sanitize-contract.test.tsx` — `kb:` 穿透 sanitize。
- **临时验证**（已删）：用真实 `ReadonlyContent` 渲染那条 CJK 长路径 → 输出 `<a href="kb:01-…">` 非 `[[…]]`。

## 当前症状 / 未解之谜

即使单测全过、源码正确，**运行中的 Desktop dev 窗口（Multica Canary）打开「测试」任务，描述和评论仍显示字面 `[[…]]`。** 且：

- dev server（localhost:5173）已确认在喂**新**代码（curl 四个文件均含 `kb:`/`preprocessKnowledgeLinks`）。
- Canary 渲染窗口（PID 86375，15:51 启动）连的就是这个 server，模块从 `/@fs/…` 实时加载。
- 却依旧输出旧行为。

## 接手 Agent 的排查方向（按优先级）

1. **确认渲染进程真正执行的模块图**：新增一个 `console.error("[KB-DEBUG] preprocess saw [[ …")` 在 `preprocessKnowledgeLinks` 入口和 `rich-content.tsx` 的 `processed` 处，让用户重开任务，然后在 dev server 日志里看有没有打出来、`[[` 是否被转换成 `kb:`。若没打出来 → 渲染进程没执行补丁代码（疑似 service worker / HTTP cache / 模块图缓存 / 连到了别的 server）。
2. **确认没有第二个渲染表面**：issue-detail 里描述是否还有**只读展示**分支未走 `ContentEditor`/`RichContent`（搜索 `issue.description` 除 3063 外是否还有其它渲染）。
3. **确认 service worker / 离线缓存**：Electron renderer 可能缓存旧模块；试 `Cmd+Shift+R` 硬刷新，或在 devtools 里检查 `Application > Service Workers`。
4. **确认当前窗口指向的 client 来源**：窗口标题栏显示 "Multica Canary"。而本机另有一个打包的 `/Applications/Multica.app`（昨晚 11:47 启动，`app.asar` 烘焙旧代码），**那个窗口永远不会有修复**。务必确认用户在看的是 Canary dev 窗口，不是 Multica.app。

## 相关进程（排查参考）

| 客户端 | 进程 | 说明 |
|--------|------|------|
| `/Applications/Multica.app`（打包生产版） | PID 20777 | 昨晚启动，`app.asar` 旧代码，**不会更新** |
| Multica Canary（dev） | PID 86375 | 今天 15:51 启动，连 localhost:5173 实时源码，应有修复 |
| Vite dev server | PID 86276 | localhost:5173，已确认喂新代码 |

## 验收标准

在 Canary dev 窗口，打开有 `[[路径]]` 的任务：
1. 描述里的 `[[…]]` → 蓝链，点击跳 `/{slug}/knowledge?path=<encoded>`。
2. 回复/评论正文里的 `[[…]]` → 蓝链（读视图）。
3. 评论框现场打字 `[[x]]` → 立即边打字边变 `kb:` 链（InputRule）。
4. code block / 已存在 URL / 图片内 `[[x]]` 保持纯文本不变。

---

## 根因与修复（2026-09-02）

**根因**：`ContentEditor` 挂载/同步时只走 `preprocessMarkdown()`，而该函数**原先不含** `preprocessKnowledgeLinks`。`issue-detail` 曾在 `value` 外包一层，但 `defaultValue`、`adoptContent`、评论编辑等路径仍喂原始 `[[…]]`；且 dev 热更新若未命中该 prop，描述也会仍是字面量。

**修复**：把 `preprocessKnowledgeLinks` 并入 `packages/views/editor/utils/preprocess.ts` 的共享管道（RichContent 只读 + ContentEditor 编辑共用）。`RichContent` / `issue-detail` 不再重复外包。

**验证**：`pnpm exec vitest run`（在 `packages/views` 下）跑 `preprocess-knowledge-links.test.ts` 及 kb 相关套件，49 项全绿。

**仍须人工确认**：打开的是 **Multica Canary（连 localhost:5173）**，不是 `/Applications/Multica.app` 打包版；改完后对 Canary 窗口 **Cmd+Shift+R** 硬刷新。

### 发送后变白字（2026-09-02 追加）

**症状**：评论/回复输入框里 `[[路径]]` 显示蓝色链接，发送后历史消息里变成白色纯文本。

**根因**：`KnowledgeLinkMarkdownLink.renderMarkdown` 对 `kb:` 链接返回完整字符串 `[[path]]`，未嵌入 Tiptap 占位符子节点。`@tiptap/markdown` 靠占位符拆分 opening/closing；opening 为空时 **link mark 在 `getMarkdown()` 时被丢弃**，API 只存纯路径文本，只读渲染无法还原链接。

**修复**：改为 `[[${helpers.renderChildren()}]]`，与 highlight 的 `==…==` 同理。

**回归测试**：`knowledge-link-input-rule.test.ts` — 输入 `[[docs/foo.md]]` 后 `getMarkdown()` 应为 `see [[docs/foo.md]]`。
