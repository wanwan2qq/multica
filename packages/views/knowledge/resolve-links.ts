/**
 * Rewrite relative links in knowledge markdown to knowledge-page URLs.
 *
 * Knowledge documents live in a Git repo and use relative links to reference
 * each other (e.g. `[PRD](./PRD.md)`, `[SOP](../sop/README.md)`). When
 * rendered in the knowledge page, these links must resolve to `?path=...`
 * URLs so clicking them navigates within the knowledge browser instead of
 * hitting a dead route. Uses the same `kb:` scheme as task `[[path]]` links so
 * RichContent's `openLink` handles clicks in-app.
 *
 * The transformation is a pure string-to-string markdown preprocessor that
 * runs before the content is handed to RichContent. It does not touch the
 * RichContent component or any of its link handling.
 */

/**
 * Check whether a link URL is a relative path (not an external URL, not an
 * anchor-only fragment, not a protocol link).
 */
function isRelativePath(url: string): boolean {
  if (!url) return false;
  // Protocol URLs: https://, http://, mailto:, etc.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return false;
  // Anchor-only: #heading
  if (url.startsWith("#")) return false;
  return true;
}

/**
 * Normalize a path by resolving `.` and `..` segments.
 * e.g. `01-贝易转/../02-研发过程/README.md` → `02-研发过程/README.md`
 */
function normalizePath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const result: string[] = [];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      result.pop();
      continue;
    }
    result.push(seg);
  }
  return result.join("/");
}

/**
 * Get the directory of a file path.
 * e.g. `01-贝易转/02-研发过程/README.md` → `01-贝易转/02-研发过程`
 * e.g. `README.md` → ``
 */
function dirname(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.slice(0, idx) : "";
}

/** Same scheme as `preprocessKnowledgeLinks` — consumed by `openLink`. */
function toKbHref(resolvedPath: string): string {
  return `kb:${encodeURIComponent(resolvedPath)}`;
}

/**
 * Rewrite markdown content so that relative links point to knowledge page
 * URLs (`kb:…`).
 *
 * Handles:
 *   - Inline links: `[text](./path/to/file.md)` → `[text](kb:path%2Fto%2Ffile.md)`
 *   - Inline links with fragments: `[text](./file.md#heading)` → `[text](kb:file.md)` (fragment stripped for now)
 *   - Absolute repo paths: `[text](/path/to/file.md)` → `[text](kb:…)`
 *   - Reference-style definitions: `[ref]: ./path/to/file.md` → `[ref]: kb:…`
 *
 * Leaves unchanged:
 *   - External URLs (`https://...`)
 *   - Anchor-only links (`#heading`)
 *   - Image links (`![alt](url)`) — images don't have a knowledge preview
 */
export function resolveKnowledgeLinks(
  markdown: string,
  currentFilePath: string,
): string {
  const dir = dirname(currentFilePath);

  // Step 1: Rewrite reference-style link definitions [ref]: url
  const refDefs = new Map<string, string>();
  const processed = markdown.replace(
    /^\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s.*)?$/gm,
    (match, _id, angleUrl, bareUrl) => {
      const url = angleUrl ?? bareUrl;
      if (!isRelativePath(url)) return match;
      const resolved = normalizePath(dir ? `${dir}/${url}` : url);
      const newUrl = toKbHref(resolved);
      refDefs.set(_id.toLowerCase(), newUrl);
      return `[${_id}]: ${newUrl}`;
    },
  );

  // Step 2: Rewrite inline links [text](url) and [text](<url>)
  // NOT image links ![alt](url)
  return processed.replace(
    /(?<!!)\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g,
    (match, text, angleUrl, bareUrl) => {
      const url = angleUrl ?? bareUrl;
      if (!isRelativePath(url)) return match;

      // Strip fragment for now — knowledge page doesn't support anchor navigation
      const urlWithoutFragment = url.split("#")[0]!;

      const resolved = normalizePath(dir ? `${dir}/${urlWithoutFragment}` : urlWithoutFragment);
      const newUrl = toKbHref(resolved);
      return `[${text}](${newUrl})`;
    },
  );
}