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

/**
 * Local browse state for the default knowledge source stays keyed by workspace
 * id, so a workspace that already remembered a branch or file keeps it. Every
 * other source gets its own key.
 */
export function knowledgeBrowseKey(wsId: string, repoUrl: string): string {
  return `${wsId}\n${repoUrl}`;
}

/** Switcher label: the description, otherwise the repository name. */
export function knowledgeSourceLabel(source: { url: string; description?: string }): string {
  const description = source.description?.trim();
  if (description) return description;
  const trimmed = source.url.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf(":"));
  const name = cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
  return name || source.url;
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
