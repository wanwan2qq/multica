// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  knowledgePathAncestorDirs,
  listKnowledgeDirectoryChildren,
  normalizeKnowledgePath,
  resolveKnowledgePath,
} from "./path-resolver";

const BLOBS = [
  "README.md",
  "01-贝易转/_overview.md",
  "01-贝易转/02-研发过程/README.md",
  "01-贝易转/02-研发过程/PRD.md",
  "docs/guides/intro.md",
];

describe("resolveKnowledgePath", () => {
  it("recognizes files, directories, and missing paths", () => {
    expect(resolveKnowledgePath("README.md", BLOBS)).toEqual({
      kind: "file",
      path: "README.md",
    });
    expect(resolveKnowledgePath("01-贝易转/02-研发过程", BLOBS)).toEqual({
      kind: "directory",
      path: "01-贝易转/02-研发过程",
    });
    expect(resolveKnowledgePath("missing/path", BLOBS)).toEqual({
      kind: "missing",
      path: "missing/path",
    });
  });

  it("normalizes leading and trailing slashes", () => {
    expect(resolveKnowledgePath("/docs/guides/", BLOBS)).toEqual({
      kind: "directory",
      path: "docs/guides",
    });
  });
});

describe("knowledgePathAncestorDirs", () => {
  it("returns every parent directory", () => {
    expect(knowledgePathAncestorDirs("01-贝易转/02-研发过程/PRD.md")).toEqual([
      "01-贝易转",
      "01-贝易转/02-研发过程",
    ]);
    expect(knowledgePathAncestorDirs("01-贝易转")).toEqual([]);
  });
});

describe("listKnowledgeDirectoryChildren", () => {
  it("lists direct child folders and files only", () => {
    expect(listKnowledgeDirectoryChildren("01-贝易转", BLOBS)).toEqual({
      directories: ["01-贝易转/02-研发过程"],
      files: ["01-贝易转/_overview.md"],
    });
    expect(listKnowledgeDirectoryChildren("01-贝易转/02-研发过程", BLOBS)).toEqual({
      directories: [],
      files: ["01-贝易转/02-研发过程/PRD.md", "01-贝易转/02-研发过程/README.md"],
    });
  });
});

describe("normalizeKnowledgePath", () => {
  it("trims and strips slashes", () => {
    expect(normalizeKnowledgePath(" /a/b/ ")).toBe("a/b");
  });
});
