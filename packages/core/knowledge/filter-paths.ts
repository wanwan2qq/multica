/** True when any path segment starts with "." (underscore-prefixed segments are kept). */
export function pathHasDotPrefixedSegment(path: string): boolean {
  const normalized = path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (normalized.length === 0) return false;
  return normalized.split("/").some((segment) => segment.startsWith("."));
}

/** Apply the knowledge-base browse filter for dot-prefixed segments. */
export function filterBrowsableKnowledgePaths(
  paths: readonly string[],
  hideDotPrefixed: boolean,
): string[] {
  if (!hideDotPrefixed) return [...paths];
  return paths.filter((path) => !pathHasDotPrefixedSegment(path));
}
