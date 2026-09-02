import {
  Extension,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownParseResult,
  type MarkdownRendererHelpers,
  type MarkdownToken,
} from "@tiptap/core";
import Link from "@tiptap/extension-link";

/**
 * Markdown parse hook for wiki-style `[[repo/path.md]]` references.
 *
 * String preprocessing (`preprocessKnowledgeLinks`) is the primary path for
 * both RichContent and ContentEditor, but @tiptap/markdown / marked leave a
 * literal `[[path]]` as plain text when it ever reaches the editor without
 * being rewritten first. This extension registers an inline tokenizer so mount,
 * sync, and paste paths still render a real `kb:` link mark.
 */
const WIKI_KNOWLEDGE_LINK_RE = /^(?:\[\[|［［)([^\]］\n]+?)(?:\]\]|］］)/;

function wikiLinkStart(src: string): number {
  const ascii = src.indexOf("[[");
  const full = src.indexOf("［［");
  if (ascii === -1) return full;
  if (full === -1) return ascii;
  return Math.min(ascii, full);
}

export const KnowledgeLinkMarkdown = Extension.create({
  name: "knowledgeWikiLink",

  markdownTokenizer: {
    name: "knowledgeWikiLink",
    level: "inline" as const,
    start: wikiLinkStart,
    tokenize(src: string) {
      const match = src.match(WIKI_KNOWLEDGE_LINK_RE);
      if (!match) return undefined;
      const path = match[1]?.trim();
      if (!path) return undefined;
      return {
        type: "knowledgeWikiLink",
        raw: match[0],
        text: path,
        href: `kb:${encodeURIComponent(path)}`,
      };
    },
  },

  parseMarkdown(
    token: MarkdownToken,
    helpers: MarkdownParseHelpers,
  ): MarkdownParseResult {
    // This tokenizer only ever dispatches `knowledgeWikiLink` tokens (tokenName
    // match), so no type guard is needed — mirror @tiptap/extension-link.
    return helpers.applyMark(
      "link",
      [helpers.createTextNode(token.text ?? "")],
      { href: token.href },
    );
  },
});

/** Keep kb: links round-tripping as `[[path]]` in stored markdown. */
export const KnowledgeLinkMarkdownLink = Link.extend({
  inclusive: false,

  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
    const href = node.attrs?.href ?? "";
    const text = helpers.renderChildren(node);
    if (typeof href === "string" && href.startsWith("kb:")) {
      // Marks serialize by splitting renderMarkdown on a placeholder child.
      // Returning a bare `[[path]]` leaves no opening/closing fences, so the
      // link mark is dropped and getMarkdown() emits plain text.
      return `[[${text}]]`;
    }
    const title = node.attrs?.title ?? "";
    return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
  },
});
