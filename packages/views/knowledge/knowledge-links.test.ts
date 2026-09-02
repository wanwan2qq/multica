// @vitest-environment node
import { describe, expect, it } from "vitest";
import { preprocessKnowledgeLinks } from "@multica/ui/markdown";

/**
 * Canonical transform matrix for the `[[path]]` → `[path](kb:path)` sugar.
 *
 * The preprocessor lives in `packages/ui/markdown/knowledge-links.ts` (which is
 * not a vitest package), so its matrix is exercised here — a pure-text test,
 * no DOM.
 */
describe("preprocessKnowledgeLinks", () => {
  it("rewrites a single wiki reference into a kb: markdown link", () => {
    expect(preprocessKnowledgeLinks("[[docs/spec.md]]")).toBe(
      "[docs/spec.md](kb:docs%2Fspec.md)",
    );
  });

  it("percent-encodes spaces in the destination but keeps the raw label", () => {
    expect(preprocessKnowledgeLinks("[[my docs/spec.md]]")).toBe(
      "[my docs/spec.md](kb:my%20docs%2Fspec.md)",
    );
  });

  it("leaves text with no wiki reference untouched", () => {
    const text = "plain text and [a normal link](https://example.com)";
    expect(preprocessKnowledgeLinks(text)).toBe(text);
  });

  it("rewrites multiple references in one pass", () => {
    expect(preprocessKnowledgeLinks("[[a.md]] and [[b/user.md]]")).toBe(
      "[a.md](kb:a.md) and [b/user.md](kb:b%2Fuser.md)",
    );
  });

  it("rewrites adjacent references separated by a non-bracket char", () => {
    expect(preprocessKnowledgeLinks("[[a]]-[[b]]")).toBe("[a](kb:a)-[b](kb:b)");
  });

  it("leaves truly adjacent references alone — they are markdown reference links", () => {
    // `[[a]][[b]]` is valid reference-link syntax `[a][b]`, not two references;
    // rewriting it would corrupt markdown parsing.
    expect(preprocessKnowledgeLinks("[[a]][[b]]")).toBe("[[a]][[b]]");
  });

  it("keeps a reference inside a fenced code block as plain text", () => {
    const text = "```\n[[docs/secret.md]]\n```";
    expect(preprocessKnowledgeLinks(text)).toBe(text);
  });

  it("keeps a reference inside inline code as plain text", () => {
    const text = "see `[[docs/secret.md]]`";
    expect(preprocessKnowledgeLinks(text)).toBe(text);
  });

  it("keeps a reference inside inline and display math as plain text", () => {
    expect(preprocessKnowledgeLinks("$[[a.md]]$")).toBe("$[[a.md]]$");
    expect(preprocessKnowledgeLinks("$$[[a.md]]$$")).toBe("$$[[a.md]]$$");
  });

  it("keeps a reference embedded in an existing markdown link label untouched", () => {
    const text = "[see [[docs/foo.md]]](https://example.com)";
    expect(preprocessKnowledgeLinks(text)).toBe(text);
  });

  it("keeps a reference that is itself a markdown link label untouched", () => {
    const text = "[[a.md]](https://example.com)";
    expect(preprocessKnowledgeLinks(text)).toBe(text);
  });

  it("keeps a reference embedded in a detected URL as plain text", () => {
    const text = "https://example.com/[[docs/foo.md]]";
    expect(preprocessKnowledgeLinks(text)).toBe(text);
  });

  it("does not rewrite an unclosed reference", () => {
    expect(preprocessKnowledgeLinks("[[docs/foo.md")).toBe("[[docs/foo.md");
  });

  it("drops an empty reference and rewrites the surrounding ones", () => {
    expect(preprocessKnowledgeLinks("[[a.md]] and [[ ]] okay")).toBe(
      "[a.md](kb:a.md) and [[ ]] okay",
    );
  });

  it("ignores whitespace-only inner content", () => {
    expect(preprocessKnowledgeLinks("[[  ]]")).toBe("[[  ]]");
  });

  it("wraps a path that is already percent-encoded without double-encoding", () => {
    // encodeURIComponent does not encode '%' again, so the destination stays
    // decodable by the openLink kb: branch.
    const out = preprocessKnowledgeLinks("[[docs/部分.md]]");
    expect(out).toBe("[docs/部分.md](kb:docs%2F%E9%83%A8%E5%88%86.md)");
    // Slice off the trailing ")" and the "kb:" scheme to reach the destination.
    expect(decodeURIComponent(out.slice(out.indexOf("kb:") + 3, -1))).toBe(
      "docs/部分.md",
    );
  });
});
