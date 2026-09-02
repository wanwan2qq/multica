export type KnowledgePathKind = "file" | "directory" | "missing";

export function normalizeKnowledgePath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Classify a repo-relative path against the remote blob list. */
export function resolveKnowledgePath(
  path: string,
  blobPaths: readonly string[],
): { kind: KnowledgePathKind; path: string } {
  const normalized = normalizeKnowledgePath(path);
  if (normalized.length === 0) {
    return { kind: "missing", path: normalized };
  }
  if (blobPaths.includes(normalized)) {
    return { kind: "file", path: normalized };
  }
  const prefix = `${normalized}/`;
  if (blobPaths.some((blobPath) => blobPath.startsWith(prefix))) {
    return { kind: "directory", path: normalized };
  }
  return { kind: "missing", path: normalized };
}

/** Parent directory paths that must be expanded to reveal `path`. */
export function knowledgePathAncestorDirs(path: string): string[] {
  const normalized = normalizeKnowledgePath(path);
  if (normalized.length === 0) return [];
  const parts = normalized.split("/");
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

/** Immediate child directories and files under `dirPath`. */
export function listKnowledgeDirectoryChildren(
  dirPath: string,
  blobPaths: readonly string[],
): { directories: string[]; files: string[] } {
  const normalized = normalizeKnowledgePath(dirPath);
  const prefix = normalized.length > 0 ? `${normalized}/` : "";
  const directories = new Set<string>();
  const files: string[] = [];

  for (const blobPath of blobPaths) {
    if (normalized.length > 0 && !blobPath.startsWith(prefix)) continue;
    const rest = normalized.length > 0 ? blobPath.slice(prefix.length) : blobPath;
    if (rest.length === 0) continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      files.push(blobPath);
    } else {
      directories.add(`${normalized.length > 0 ? `${normalized}/` : ""}${rest.slice(0, slash)}`);
    }
  }

  return {
    directories: [...directories].sort((a, b) => a.localeCompare(b)),
    files: files.sort((a, b) => a.localeCompare(b)),
  };
}
