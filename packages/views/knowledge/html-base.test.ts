import { describe, expect, it } from "vitest";
import { injectKnowledgeBase } from "./html-base";

const BASE = "/api/workspaces/ws/knowledge/assets/token/docs/";

function resolveRelative(href: string) {
  return `/api/workspaces/ws/knowledge/assets/token/${href.replace(/^\.\//, "")}`;
}

describe("injectKnowledgeBase", () => {
  it("inserts the base right after the doctype", () => {
    const html = "<!DOCTYPE html><html><head></head><body></body></html>";
    expect(injectKnowledgeBase(html, BASE)).toBe(
      `<!DOCTYPE html><base href="${BASE}"><html><head></head><body></body></html>`,
    );
  });

  it("is case-insensitive about the doctype", () => {
    expect(injectKnowledgeBase("<!doctype html><p>x</p>", BASE)).toContain(
      `<!doctype html><base href="${BASE}">`,
    );
  });

  it("skips a leading comment before the doctype", () => {
    const html = "<!-- x --><!doctype html><html></html>";
    expect(injectKnowledgeBase(html, BASE)).toBe(
      `<!-- x --><!doctype html><base href="${BASE}"><html></html>`,
    );
  });

  it("prepends when the document has no doctype", () => {
    expect(injectKnowledgeBase("<html><body></body></html>", BASE)).toBe(
      `<base href="${BASE}"><html><body></body></html>`,
    );
  });

  it("leaves a document that already targets an absolute origin", () => {
    const html =
      '<!doctype html><head><base href="https://example.com/assets/"></head>';
    expect(injectKnowledgeBase(html, BASE, resolveRelative)).toBe(html);
  });

  it("leaves a protocol-relative base alone too", () => {
    const html = '<!doctype html><head><base href="//cdn.example.com/"></head>';
    expect(injectKnowledgeBase(html, BASE, resolveRelative)).toBe(html);
  });

  it("re-targets a relative base instead of shadowing it", () => {
    const html = '<!doctype html><head><base href="./assets/"></head>';
    const result = injectKnowledgeBase(html, BASE, resolveRelative);
    expect(result).toBe(
      '<!doctype html><head><base href="/api/workspaces/ws/knowledge/assets/token/assets/"></head>',
    );
    expect(result.match(/<base\b/g)).toHaveLength(1);
  });

  it("adds an href when the only base supplies a target", () => {
    const html = '<!doctype html><head><base target="_blank"></head>';
    expect(injectKnowledgeBase(html, BASE)).toBe(
      `<!doctype html><base href="${BASE}"><head><base target="_blank"></head>`,
    );
  });

  it("escapes the injected href", () => {
    expect(injectKnowledgeBase("<p>x</p>", '/a/"b"/c')).toBe(
      '<base href="/a/&quot;b&quot;/c"><p>x</p>',
    );
  });

  it("does nothing without a base", () => {
    const html = "<!doctype html><html></html>";
    expect(injectKnowledgeBase(html, "")).toBe(html);
  });
});
