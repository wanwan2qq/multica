/**
 * Knowledge asset URLs.
 *
 * Images and other sibling files are served by a capability route whose token
 * lives in the path (`/api/workspaces/{id}/knowledge/assets/{token}/…`). The
 * token has to be part of the URL, not a query or header: a desktop renderer
 * runs on `file://` with a bearer token and no API cookie, so a native
 * `<img>`/`<link>` request carries no credentials at all, and the HTML preview
 * resolves relatives against a `<base href>` that cannot hand a query down to
 * them.
 *
 * The server returns a site-relative prefix; callers join it onto their API
 * base so a same-origin web deployment stays relative while desktop gets an
 * absolute URL.
 */

/** Join the API base and the server's site-relative assets prefix. */
export function resolveAssetsBase(
  apiBase: string | null | undefined,
  assetsBase: string | null | undefined,
): string {
  const prefix = (assetsBase ?? "").trim().replace(/\/+$/, "");
  if (!prefix) return "";
  const origin = (apiBase ?? "").trim().replace(/\/+$/, "");
  return `${origin}${prefix}`;
}

/**
 * Percent-encode a repository path segment by segment, keeping the `/`
 * separators. Parentheses are escaped even though they are legal in a URL
 * path: they terminate a markdown destination, and these URLs are written into
 * markdown image syntax as well as `src` attributes.
 */
export function encodeKnowledgeRepoPath(filePath: string): string {
  return filePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      encodeURIComponent(segment).replace(/[()]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

/** The URL of one repository file under an assets base (either may be empty). */
export function knowledgeAssetURL(
  assetsBase: string | null | undefined,
  filePath: string,
): string {
  const base = (assetsBase ?? "").trim().replace(/\/+$/, "");
  const encoded = encodeKnowledgeRepoPath(filePath);
  if (!base) return "";
  return encoded ? `${base}/${encoded}` : `${base}/`;
}

/** Resolve a repository-relative path against a document's directory. */
export function resolveKnowledgeRelativePath(
  documentPath: string,
  relative: string,
): string {
  const idx = documentPath.lastIndexOf("/");
  const dir = idx > 0 ? documentPath.slice(0, idx) : "";
  const combined = relative.startsWith("/")
    ? relative
    : dir
      ? `${dir}/${relative}`
      : relative;
  const segments: string[] = [];
  for (const segment of combined.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/**
 * The `<base href>` a knowledge HTML document resolves its relatives against:
 * the assets base plus the document's own directory, with a trailing slash so
 * `images/a.png` appends instead of replacing the last segment.
 */
export function knowledgeAssetsBaseHref(
  assetsBase: string | null | undefined,
  documentPath: string,
): string {
  const base = (assetsBase ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  const idx = documentPath.lastIndexOf("/");
  const dir = idx > 0 ? documentPath.slice(0, idx) : "";
  const encodedDir = encodeKnowledgeRepoPath(dir);
  return encodedDir ? `${base}/${encodedDir}/` : `${base}/`;
}
