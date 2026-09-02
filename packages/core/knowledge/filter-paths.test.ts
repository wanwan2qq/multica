// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  filterBrowsableKnowledgePaths,
  pathHasDotPrefixedSegment,
} from "./filter-paths";

describe("pathHasDotPrefixedSegment", () => {
  it("detects dot-prefixed segments at any depth", () => {
    expect(pathHasDotPrefixedSegment(".env")).toBe(true);
    expect(pathHasDotPrefixedSegment("docs/.hidden/readme.md")).toBe(true);
    expect(pathHasDotPrefixedSegment("_overview.md")).toBe(false);
    expect(pathHasDotPrefixedSegment("01-team/_overview.md")).toBe(false);
    expect(pathHasDotPrefixedSegment("docs/readme.md")).toBe(false);
  });
});

describe("filterBrowsableKnowledgePaths", () => {
  const paths = [
    "README.md",
    "_overview.md",
    ".env",
    "docs/.secret/note.md",
    "01-team/_overview.md",
  ];

  it("returns all paths when hiding is disabled", () => {
    expect(filterBrowsableKnowledgePaths(paths, false)).toEqual(paths);
  });

  it("drops paths with any dot-prefixed segment when hiding is enabled", () => {
    expect(filterBrowsableKnowledgePaths(paths, true)).toEqual([
      "README.md",
      "_overview.md",
      "01-team/_overview.md",
    ]);
  });
});
