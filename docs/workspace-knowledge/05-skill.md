# Skill 草案：workspace-knowledge

在 Multica 工作区创建 Skill，名称 `workspace-knowledge`，绑定需要读/写知识库的 Agent。  
也可把下文存进知识库 Git，再导入 Multica。

---

```markdown
---
name: workspace-knowledge
description: >
  Use when the task needs team knowledge, PRD, tech design, SOP, FAQ,
  research notes, or when asked to add/update documents in the workspace
  knowledge Git repo. Do not use for issue status, assignee, or queue
  changes — those live in Multica.
---

# Workspace knowledge

The workspace knowledge base is a Git repository registered in
**workspace repos**. Multica Issues own process state. This repo owns
documents.

## Locate

1. Read `## Repositories` in the runtime brief. Use the repo whose
   description mentions 知识库 / knowledge base.
2. Entry file: `01-贝易转/_overview.md` (other products have their own
   `_overview.md` at the product root).
3. Prefer MCP tools `kb.tree` / `kb.search` / `kb.read` when they are
   available. Otherwise:

   ```bash
   multica repo checkout <knowledge-repo-url>
   ```

   Then open `_overview.md` and at most 1–3 relevant directories.

## Read rules

- Never dump the whole tree into an issue comment or chat reply.
- Cite Git paths (and headings), not pasted chapters.
- Process fields (status, owner, version, queue) are in Multica Issues.
  Ignore status tables inside the knowledge repo if they disagree.

## Write rules (add or edit files)

You MAY add or edit knowledge files. You MUST use Git, never MCP writes.

```bash
multica repo checkout <knowledge-repo-url>
# edit or create markdown in the checkout
git add <paths>
git commit -m "docs(<area>): <summary> (<issue-or-REQ-id>)"
git push -u origin HEAD
```

Allowed:

- New research notes, tech design, FAQ, SOP drafts
- Fill PRD / test report / support docs from templates
- Update files this task named
- Add **links** to the local `_overview.md` (do not edit status columns)

Forbidden:

- Demand-pool status / owner / version columns in `_overview.md`
- `02-研发过程/00-任务队列/queue.md` and other process ledgers
- Deleting other people's docs, rewriting git history, force-push
- Pushing directly to `main` / `master`
- Editing unrelated directories in the same commit
- Copying long document bodies into the Multica issue as "archive"

After a write: comment on the issue with path, branch name, and PR URL
if you opened one. Leave the issue status to the human / PMO unless the
task explicitly assigned you that field.

## Mapping reminder

| Thing | Where |
|-------|--------|
| Requirement / task status | Multica issue |
| PRD, design, SOP, FAQ | This Git repo |
| Who is on it / due date | Multica issue |
```
