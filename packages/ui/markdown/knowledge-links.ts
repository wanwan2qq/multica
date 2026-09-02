import {
  detectLinks,
  findCodeRanges,
  findMarkdownLinkRanges,
  isInsideCode,
  rangesOverlap,
} from './linkify'

/**
 * Wiki-style knowledge base link autolinking for markdown preprocessing.
 *
 * Rewrites `[[repo/path.md]]` into a canonical `kb:` link
 * `[repo/path.md](kb:repo%2Fpath.md)`, so the shared markdown `a` renderer
 * routes it to the workspace knowledge base page (the views layer's openLink
 * resolves `kb:` into a jump to `/{slug}/knowledge?path=…`).
 *
 * This module is intentionally PURE (packages/ui): it has no workspace or API
 * access and only DETECTS candidate paths. Whether a path resolves to a real
 * knowledge file is the knowledge page's concern; over-detecting here only
 * yields a link that, on click, shows the normal KB not-found state.
 *
 * Skipped contexts (never rewritten) — mirrors preprocessIssueIdentifiers:
 *   - fenced code blocks, inline code, and math (findCodeRanges)
 *   - existing markdown links / images (findMarkdownLinkRanges)
 *   - detected URLs / emails / file paths (detectLinks)
 *
 * The destination is percent-encoded so paths containing spaces or parentheses
 * stay valid markdown link destinations; the visible label keeps the raw text.
 */
const KNOWLEDGE_LINK_RE = /(?:\[\[|［［)([^\]］\n]+?)(?:\]\]|］］)/g

/**
 * Rewrite wiki-style `[[path]]` references into `kb:` markdown links.
 */
export function preprocessKnowledgeLinks(text: string): string {
  // Cheap early-out: nothing that looks like a `[[…]]` pair at all.
  if (!text.includes('[[')) return text

  const codeRanges = findCodeRanges(text)
  const linkRanges = findMarkdownLinkRanges(text)
  const detectedLinks = detectLinks(text)

  KNOWLEDGE_LINK_RE.lastIndex = 0
  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = KNOWLEDGE_LINK_RE.exec(text)) !== null) {
    const raw = match[1]
    if (!raw) continue
    const path = raw.trim()
    if (!path) continue

    const start = match.index
    const end = start + match[0].length
    const range = { start, end }

    // Inside fenced/inline code or math.
    if (isInsideCode(start, codeRanges)) continue
    // Inside an existing markdown link/image (label OR destination).
    if (linkRanges.some((r) => rangesOverlap(range, r))) continue
    // Inside a detected URL / email / file path.
    if (detectedLinks.some((l) => rangesOverlap(range, l))) continue

    result += text.slice(lastIndex, start)
    result += `[${path}](kb:${encodeURIComponent(path)})`
    lastIndex = end
  }

  if (lastIndex === 0) return text
  result += text.slice(lastIndex)
  return result
}
