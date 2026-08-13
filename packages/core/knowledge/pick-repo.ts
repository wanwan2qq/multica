/**
 * Pick which workspace repo is the knowledge base.
 *
 * Match description containing 知识库 / knowledge (case-insensitive).
 * If none match and there is exactly one repo, use that.
 * Otherwise return null — the UI asks the user to label a repo.
 */
export function pickKnowledgeRepo(
  repos: Array<{ url: string; description?: string }> | null | undefined,
): { url: string; description?: string } | null {
  const list = repos ?? [];
  const tagged = list.find((repo) => isKnowledgeDescription(repo.description));
  if (tagged) return tagged;
  if (list.length === 1) return list[0] ?? null;
  return null;
}

export function isKnowledgeDescription(description: string | undefined): boolean {
  const text = description?.toLowerCase() ?? "";
  return text.includes("知识库") || text.includes("knowledge");
}

export function defaultKnowledgePath(paths: string[]): string | null {
  const markdown = paths.filter((path) => /\.(md|markdown)$/i.test(path));
  const overviews = markdown.filter((path) => /(^|\/)_overview\.md$/i.test(path));
  if (overviews.length > 0) {
    return [...overviews].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0] ?? null;
  }
  const readmes = markdown.filter((path) => /(^|\/)readme\.md$/i.test(path));
  if (readmes.length > 0) {
    return [...readmes].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0] ?? null;
  }
  return markdown.sort((a, b) => a.localeCompare(b))[0] ?? null;
}
