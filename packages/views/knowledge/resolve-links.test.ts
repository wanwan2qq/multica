import { describe, expect, it } from "vitest";
import { resolveKnowledgeLinks } from "./resolve-links";

describe("resolveKnowledgeLinks", () => {
  it("rewrites a relative inline link to a knowledge page URL", () => {
    const result = resolveKnowledgeLinks(
      "[PRD](./PRD.md)",
      "01-贝易转/02-研发过程/README.md",
    );
    expect(result).toContain("[PRD](?path=");
    expect(result).toContain(
      "01-%E8%B4%9D%E6%98%93%E8%BD%AC%2F02-%E7%A0%94%E5%8F%91%E8%BF%87%E7%A8%8B%2FPRD.md",
    );
  });

  it("rewrites a parent-directory relative link", () => {
    const result = resolveKnowledgeLinks(
      "[Overview](../_overview.md)",
      "01-贝易转/02-研发过程/README.md",
    );
    expect(result).toContain("[Overview](?path=");
    expect(result).toContain(
      "01-%E8%B4%9D%E6%98%93%E8%BD%AC%2F_overview.md",
    );
  });

  it("rewrites a repo-root absolute link", () => {
    const result = resolveKnowledgeLinks(
      "[Root](/README.md)",
      "01-贝易转/02-研发过程/README.md",
    );
    expect(result).toContain("[Root](?path=");
    expect(result).toContain("README.md");
  });

  it("strips fragments from the rewritten URL", () => {
    const result = resolveKnowledgeLinks(
      "[Section](./PRD.md#heading)",
      "01-贝易转/README.md",
    );
    expect(result).not.toContain("#heading");
    expect(result).toContain("?path=");
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
    // Image links should not be rewritten
    expect(result).toBe(input);
  });

  it("rewrites reference-style link definitions", () => {
    const input = [
      "See the [PRD][prd] for details.",
      "",
      "[prd]: ./PRD.md",
    ].join("\n");
    const result = resolveKnowledgeLinks(input, "01-贝易转/README.md");
    expect(result).toContain("[prd]: ?path=");
  });

  it("handles same-directory link with no current dir", () => {
    const result = resolveKnowledgeLinks(
      "[Other](./other.md)",
      "README.md",
    );
    expect(result).toContain("[Other](?path=other.md)");
  });

  it("handles multiple links in one document", () => {
    const input = `# Doc

See [PRD](./PRD.md) and [SOP](./sop.md).

Also check [External](https://example.com).`;
    const result = resolveKnowledgeLinks(input, "docs/README.md");
    expect(result).toContain("?path=docs%2FPRD.md");
    expect(result).toContain("?path=docs%2Fsop.md");
    expect(result).toContain("https://example.com");
  });

  it("leaves non-relative paths that look like URLs unchanged", () => {
    const input = "Check [mail](mailto:test@example.com)";
    const result = resolveKnowledgeLinks(input, "README.md");
    expect(result).toBe(input);
  });
});