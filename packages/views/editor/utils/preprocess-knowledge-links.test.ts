// @vitest-environment node
import { describe, expect, it } from "vitest";
import { preprocessMarkdown } from "./preprocess";

/**
 * The shared preprocess pipeline must rewrite `[[path]]` for both the readonly
 * renderer (RichContent) and the Tiptap editor (ContentEditor mount/sync).
 * Callers should not need to wrap raw markdown themselves.
 */
describe("preprocessMarkdown — knowledge links", () => {
  it("rewrites wiki references in the shared pipeline", () => {
    expect(preprocessMarkdown("[[docs/foo.md]]", { cdnDomain: "" })).toBe(
      "[docs/foo.md](kb:docs%2Ffoo.md)",
    );
  });

  it("rewrites wiki references before linkify runs", () => {
    expect(
      preprocessMarkdown("详见 [[01-贝易转/02-研发过程/spec.md]]", {
        cdnDomain: "",
      }),
    ).toBe(
      "详见 [01-贝易转/02-研发过程/spec.md](kb:01-%E8%B4%9D%E6%98%93%E8%BD%AC%2F02-%E7%A0%94%E5%8F%91%E8%BF%87%E7%A8%8B%2Fspec.md)",
    );
  });

  it("does not autolink issue identifiers in the editable pipeline", () => {
    expect(
      preprocessMarkdown("see [[docs/a.md]] and MUL-123", { cdnDomain: "" }),
    ).toBe("see [docs/a.md](kb:docs%2Fa.md) and MUL-123");
  });

  it("autolinks issue identifiers in the readonly pipeline", () => {
    expect(
      preprocessMarkdown("see [[docs/a.md]] and MUL-123", {
        cdnDomain: "",
        autolinkIssueIdentifiers: true,
      }),
    ).toBe(
      "see [docs/a.md](kb:docs%2Fa.md) and [MUL-123](mention://issue/MUL-123)",
    );
  });
});
