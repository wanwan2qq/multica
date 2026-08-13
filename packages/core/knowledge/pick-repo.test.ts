import { describe, expect, it } from "vitest";
import { defaultKnowledgePath, pickKnowledgeRepo } from "./pick-repo";

describe("pickKnowledgeRepo", () => {
  it("prefers a repo whose description mentions 知识库", () => {
    const picked = pickKnowledgeRepo([
      { url: "https://git.example/code.git", description: "backend" },
      { url: "https://git.example/kb.git", description: "工作区知识库" },
    ]);
    expect(picked?.url).toBe("https://git.example/kb.git");
  });

  it("matches English knowledge in the description", () => {
    const picked = pickKnowledgeRepo([
      { url: "https://git.example/a.git" },
      { url: "https://git.example/b.git", description: "team knowledge base" },
    ]);
    expect(picked?.url).toBe("https://git.example/b.git");
  });

  it("falls back to the only repo", () => {
    const picked = pickKnowledgeRepo([{ url: "https://git.example/solo.git" }]);
    expect(picked?.url).toBe("https://git.example/solo.git");
  });

  it("returns null when several untagged repos exist", () => {
    expect(
      pickKnowledgeRepo([
        { url: "https://git.example/a.git" },
        { url: "https://git.example/b.git" },
      ]),
    ).toBeNull();
  });
});

describe("defaultKnowledgePath", () => {
  it("prefers the shallowest _overview.md", () => {
    expect(
      defaultKnowledgePath([
        "01-贝易转/02-研发过程/_overview.md",
        "01-贝易转/_overview.md",
        "README.md",
      ]),
    ).toBe("01-贝易转/_overview.md");
  });

  it("falls back to README.md then any markdown", () => {
    expect(defaultKnowledgePath(["docs/note.md", "README.md"])).toBe("README.md");
    expect(defaultKnowledgePath(["docs/note.md"])).toBe("docs/note.md");
  });
});
