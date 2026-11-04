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

import { encodeKnowledgeRepoPath } from "./asset-urls";

/**
 * Check whether a link URL is a relative path (not an external URL, not an
 * anchor-only fragment, not a protocol link).
 */
function isRelativePath(url: string): boolean {
  if (!url) return false;
  // Protocol URLs: https://, http://, mailto:, etc.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return false;
  // Protocol-relative: //cdn.example/x.png is another origin, not a repo path.
  if (url.startsWith("//")) return false;
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
 *   - Image usages (`![alt](url)`, `![alt][id]`) follow the same resolution but
 *     target the asset route instead, when the caller supplies an assets base.
 *
 * Leaves unchanged:
 *   - External URLs (`https://...`, `//host/...`)
 *   - Anchor-only links (`#heading`)
 *   - Image usages when no assets base is supplied — except that a definition
 *     used only by images is no longer rewritten to `kb:` (an `<img src="kb:…">`
 *     can never load).
 */
export function resolveKnowledgeLinks(
  markdown: string,
  currentFilePath: string,
  assetsBase = "",
): string {
  const dir = dirname(currentFilePath);
  const assetBase = assetsBase.replace(/\/+$/, "");
  const imageOnlyRefs = imageOnlyReferenceIds(markdown);

  // Step 0: Inline image references (`![alt][id]`, `![alt][]`, `![id]`) become
  // ordinary inline images pointed at the asset route, so the definition can
  // stay untouched for the links that may also use it.
  const definitions = referenceDefinitions(markdown);
  let result = markdown;
  if (assetBase) {
    const inlineImageRef = (alt: string, refId: string) => {
      const definition = definitions.get((refId || alt).toLowerCase());
      if (!definition) return null;
      const assetURL = imageAssetURL(assetBase, dir, definition);
      return assetURL ? `![${alt}](${assetURL})` : null;
    };
    result = result
      .replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (match, alt, id) =>
        inlineImageRef(alt, id) ?? match,
      )
      .replace(/!\[([^\]]+)\](?!\[|\()/g, (match, alt) =>
        inlineImageRef(alt, alt) ?? match,
      );
  }

  // Step 1: Rewrite reference-style link definitions [ref]: url
  result = result.replace(
    /^\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s.*)?$/gm,
    (match, id, angleUrl, bareUrl) => {
      const url = angleUrl ?? bareUrl;
      if (!isRelativePath(url)) return match;
      // An image-only definition stays as written: rewriting it to `kb:` gives
      // the image a scheme its loader cannot resolve.
      if (imageOnlyRefs.has(String(id).toLowerCase())) return match;
      const resolved = normalizePath(dir ? `${dir}/${url}` : url);
      return `[${id}]: ${toKbHref(resolved)}`;
    },
  );

  // Step 2: Rewrite inline images ![alt](url) / ![alt](<url>)
  if (assetBase) {
    result = result.replace(
      /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g,
      (match, alt, angleUrl, bareUrl) => {
        const assetURL = imageAssetURL(assetBase, dir, angleUrl ?? bareUrl ?? "");
        return assetURL ? `![${alt}](${assetURL})` : match;
      },
    );
  }

  // Step 3: Rewrite inline links [text](url) and [text](<url>)
  // NOT image links ![alt](url)
  return result.replace(
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

/** Every reference definition in the document, keyed by lower-cased id. */
function referenceDefinitions(markdown: string): Map<string, string> {
  const definitions = new Map<string, string>();
  const re = /^\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s.*)?$/gm;
  for (const match of markdown.matchAll(re)) {
    definitions.set(String(match[1]).toLowerCase(), match[2] ?? match[3] ?? "");
  }
  return definitions;
}

/**
 * Reference ids that only images use. Their definitions must stay verbatim:
 * turning them into `kb:` would hand `<img>` a scheme it cannot load.
 */
function imageOnlyReferenceIds(markdown: string): Set<string> {
  const imageIds = new Set<string>();
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\[([^\]]*)\]/g)) {
    imageIds.add(String(match[2] || match[1]).toLowerCase());
  }
  for (const match of markdown.matchAll(/!\[([^\]]+)\](?!\[|\()/g)) {
    imageIds.add(String(match[1]).toLowerCase());
  }
  // An image-only definition nothing references is indistinguishable from an
  // unused one, and leaving it alone is the safe direction either way.
  const linkIds = new Set<string>();
  for (const match of markdown.matchAll(/(?<!!)\[([^\]]*)\]\[([^\]]*)\]/g)) {
    linkIds.add(String(match[2] || match[1]).toLowerCase());
  }
  for (const id of linkIds) imageIds.delete(id);
  return imageIds;
}

/**
 * Resolve an image destination to an asset-route URL, or null when the
 * destination is not a repository path. Fragments are preserved: an SVG view
 * fragment (`#glyph`) is part of the image's meaning.
 */
function imageAssetURL(assetBase: string, dir: string, url: string): string | null {
  // Already re-targeted by an earlier step (a reference image inlined above):
  // prefixing it again would nest the base inside itself.
  if (url === assetBase || url.startsWith(`${assetBase}/`)) return null;
  if (!isRelativePath(url)) return null;
  const hashIndex = url.indexOf("#");
  const pathname = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : "";
  if (!pathname) return null;
  const resolved = normalizePath(
    pathname.startsWith("/") ? pathname : dir ? `${dir}/${pathname}` : pathname,
  );
  if (!resolved) return null;
  return `${assetBase}/${encodeKnowledgeRepoPath(resolved)}${fragment}`;
}