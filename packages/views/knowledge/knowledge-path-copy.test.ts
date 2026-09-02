// @vitest-environment node

import { describe, expect, it } from "vitest";
import { formatKnowledgeRepoPath, formatKnowledgeWikiLink } from "./knowledge-path-copy";

describe("formatKnowledgeRepoPath", () => {
  it("trims whitespace and strips a leading slash", () => {
    expect(formatKnowledgeRepoPath(" /docs/foo.md ")).toBe("docs/foo.md");
  });

  it("preserves directory paths", () => {
    expect(formatKnowledgeRepoPath("01-贝易转/02-研发过程")).toBe("01-贝易转/02-研发过程");
  });
});

describe("formatKnowledgeWikiLink", () => {
  it("wraps the repo path in double brackets", () => {
    expect(formatKnowledgeWikiLink("docs/foo.md")).toBe("[[docs/foo.md]]");
  });

  it("returns empty for blank input", () => {
    expect(formatKnowledgeWikiLink("   ")).toBe("");
  });
});
