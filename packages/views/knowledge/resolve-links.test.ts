import { describe, expect, it } from "vitest";
import { resolveKnowledgeLinks } from "./resolve-links";

describe("resolveKnowledgeLinks", () => {
  it("rewrites a relative inline link to a kb: knowledge URL", () => {
    const result = resolveKnowledgeLinks(
      "[PRD](./PRD.md)",
      "01-贝易转/02-研发过程/README.md",
    );
    expect(result).toContain("[PRD](kb:");
    expect(result).toContain(
      "01-%E8%B4%9D%E6%98%93%E8%BD%AC%2F02-%E7%A0%94%E5%8F%91%E8%BF%87%E7%A8%8B%2FPRD.md",
    );
  });

  it("rewrites a parent-directory relative link", () => {
    const result = resolveKnowledgeLinks(
      "[Overview](../_overview.md)",
      "01-贝易转/02-研发过程/README.md",
    );
    expect(result).toContain("[Overview](kb:");
    expect(result).toContain(
      "01-%E8%B4%9D%E6%98%93%E8%BD%AC%2F_overview.md",
    );
  });

  it("rewrites a repo-root absolute link", () => {
    const result = resolveKnowledgeLinks(
      "[Root](/README.md)",
      "01-贝易转/02-研发过程/README.md",
    );
    expect(result).toContain("[Root](kb:");
    expect(result).toContain("README.md");
  });

  it("strips fragments from the rewritten URL", () => {
    const result = resolveKnowledgeLinks(
      "[Section](./PRD.md#heading)",
      "01-贝易转/README.md",
    );
    expect(result).not.toContain("#heading");
    expect(result).toContain("kb:");
  });

  it("leaves external URLs unchanged", () => {
    const input = "See [Google](https://www.google.com) for more.";
    const result = resolveKnowledgeLinks(input, "README.md");
    expect(result).toBe(input);
  });

  it("leaves anchor-only links unchanged", () => {
    const input = "See [above](#section-name) for details.";
    const result = resolveKnowledgeLinks(input, "README.md");
    expect(result).toBe(input);
  });

  it("leaves image links unchanged", () => {
    const input = "![diagram](./img/diagram.png)";
    const result = resolveKnowledgeLinks(input, "README.md");
    expect(result).toBe(input);
  });

  it("rewrites reference-style link definitions", () => {
    const input = [
      "See the [PRD][prd] for details.",
      "",
      "[prd]: ./PRD.md",
    ].join("\n");
    const result = resolveKnowledgeLinks(input, "01-贝易转/README.md");
    expect(result).toContain("[prd]: kb:");
  });

  it("handles same-directory link with no current dir", () => {
    const result = resolveKnowledgeLinks(
      "[Other](./other.md)",
      "README.md",
    );
    expect(result).toBe("[Other](kb:other.md)");
  });

  it("handles multiple links in one document", () => {
    const input = `# Doc

See [PRD](./PRD.md) and [SOP](./sop.md).

Also check [External](https://example.com).`;
    const result = resolveKnowledgeLinks(input, "docs/README.md");
    expect(result).toContain("kb:docs%2FPRD.md");
    expect(result).toContain("kb:docs%2Fsop.md");
    expect(result).toContain("https://example.com");
  });

  it("leaves non-relative paths that look like URLs unchanged", () => {
    const input = "Check [mail](mailto:test@example.com)";
    const result = resolveKnowledgeLinks(input, "README.md");
    expect(result).toBe(input);
  });

  it("treats protocol-relative URLs as external", () => {
    const input = "![logo](//cdn.example.com/logo.png) and [site](//example.com)";
    const result = resolveKnowledgeLinks(input, "docs/README.md", "/api/assets");
    expect(result).toBe(input);
  });

  describe("images with an assets base", () => {
    const base = "/api/workspaces/ws/knowledge/assets/token";

    it("rewrites a relative image to the asset route", () => {
      const result = resolveKnowledgeLinks(
        "![diagram](./img/diagram.png)",
        "docs/guide.md",
        base,
      );
      expect(result).toBe(
        "![diagram](/api/workspaces/ws/knowledge/assets/token/docs/img/diagram.png)",
      );
    });

    it("resolves parent and repo-root image paths", () => {
      expect(
        resolveKnowledgeLinks("![a](../assets/a.png)", "docs/guide.md", base),
      ).toBe(`![a](${base}/assets/a.png)`);
      expect(resolveKnowledgeLinks("![b](/brand/b.png)", "docs/guide.md", base)).toBe(
        `![b](${base}/brand/b.png)`,
      );
    });

    it("percent-encodes CJK names and parentheses", () => {
      // A destination with a space needs the angle-bracket markdown form.
      const result = resolveKnowledgeLinks(
        "![图](<./图 (1).png>)",
        "docs/guide.md",
        base,
      );
      expect(result).toBe(
        `![图](${base}/docs/${encodeURIComponent("图")}%20%281%29.png)`,
      );
    });

    it("keeps the fragment on an SVG view reference", () => {
      const result = resolveKnowledgeLinks(
        "![icon](./icons.svg#glyph)",
        "README.md",
        base,
      );
      expect(result).toBe(`![icon](${base}/icons.svg#glyph)`);
    });

    it("inlines a reference-style image and leaves its definition alone", () => {
      const input = ["![diagram][pic]", "", "[pic]: ./img/a.png"].join("\n");
      const result = resolveKnowledgeLinks(input, "docs/README.md", base);
      expect(result).toContain(`![diagram](${base}/docs/img/a.png)`);
      // The definition must not become `kb:` — an <img src="kb:..."> never loads.
      expect(result).toContain("[pic]: ./img/a.png");
      expect(result).not.toContain("[pic]: kb:");
    });

    it("keeps a shared definition usable by links", () => {
      const input = [
        "![diagram][ref] and [the doc][ref]",
        "",
        "[ref]: ./notes.md",
      ].join("\n");
      const result = resolveKnowledgeLinks(input, "README.md", base);
      expect(result).toContain(`![diagram](${base}/notes.md)`);
      expect(result).toContain("[ref]: kb:notes.md");
    });

    it("still resolves relative links to kb: URLs", () => {
      const result = resolveKnowledgeLinks("[PRD](./PRD.md)", "docs/README.md", base);
      expect(result).toBe("[PRD](kb:docs%2FPRD.md)");
    });
  });

  it("does not rewrite an image-only definition to kb: without an assets base", () => {
    const input = ["![diagram][pic]", "", "[pic]: ./img/a.png"].join("\n");
    const result = resolveKnowledgeLinks(input, "README.md");
    expect(result).toContain("[pic]: ./img/a.png");
    expect(result).not.toContain("[pic]: kb:");
  });
});
