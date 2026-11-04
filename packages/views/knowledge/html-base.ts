/**
 * Give a knowledge HTML document a base URL for its relative resources.
 *
 * The preview renders the file through an iframe `srcDoc`, so every relative
 * `src`/`href` resolves against the host page — `/acme/knowledge/images/a.png`
 * — and 404s. Pointing `<base href>` at the asset route makes the document
 * resolve relatives the way it would when opened from its directory.
 *
 * HTML keeps only the FIRST `<base>` that has an `href`, so the injected tag
 * must precede any the author wrote. A document that already targets an
 * absolute origin is left completely alone: it asked for that origin. A
 * relative one is rewritten relative to the document's own directory instead,
 * which is what the author meant when the file lived in Git.
 */

const DOCTYPE_RE = /^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype[^>]*>/i;
const BASE_RE = /<base\b[^>]*>/gi;
const BASE_HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** Whether a base href points at a real origin rather than a repo path. */
function isExternalHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  return value.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function firstBaseHref(html: string): string | null {
  for (const match of html.matchAll(BASE_RE)) {
    const href = BASE_HREF_RE.exec(match[0]);
    if (!href) continue;
    return href[1] ?? href[2] ?? href[3] ?? "";
  }
  return null;
}

function insertAfterDoctype(html: string, tag: string): string {
  const match = DOCTYPE_RE.exec(html);
  if (!match) return tag + html;
  const end = match.index + match[0].length;
  return html.slice(0, end) + tag + html.slice(end);
}

export function injectKnowledgeBase(
  html: string,
  baseHref: string,
  resolveRelativeBase: (href: string) => string | null = () => null,
): string {
  const base = baseHref.trim();
  if (!base) return html;

  const existing = firstBaseHref(html);
  if (existing !== null) {
    if (isExternalHref(existing)) return html;
    const rewritten = resolveRelativeBase(existing);
    if (!rewritten) return html;
    let replaced = false;
    // Replace only the first <base href>; a later one never wins anyway.
    return html.replace(BASE_RE, (tag) => {
      if (replaced || !BASE_HREF_RE.test(tag)) return tag;
      replaced = true;
      return tag.replace(BASE_HREF_RE, `href="${escapeAttribute(rewritten)}"`);
    });
  }

  return insertAfterDoctype(html, `<base href="${escapeAttribute(base)}">`);
}
