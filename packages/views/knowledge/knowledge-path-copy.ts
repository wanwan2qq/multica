/** Repo-relative path as stored in Git and used in `?path=` / `[[path]]`. */
export function formatKnowledgeRepoPath(path: string): string {
  return path.trim().replace(/^\/+/, "");
}

/** Wiki-style reference for task comments and descriptions. */
export function formatKnowledgeWikiLink(path: string): string {
  const repoPath = formatKnowledgeRepoPath(path);
  return repoPath.length > 0 ? `[[${repoPath}]]` : "";
}
