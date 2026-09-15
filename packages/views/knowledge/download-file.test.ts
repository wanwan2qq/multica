// @vitest-environment node
import { describe, expect, it } from "vitest";
import { knowledgeDownloadFilename } from "./download-file";

// Canonical for filename derivation. `saveBlobAsFile`'s DOM wiring is asserted
// through the page suite, where a real click produces the anchor.
describe("knowledgeDownloadFilename", () => {
  it("takes the last segment of a nested path", () => {
    expect(knowledgeDownloadFilename("docs/guides/getting-started.md")).toBe(
      "getting-started.md",
    );
  });

  it("returns a bare filename unchanged", () => {
    expect(knowledgeDownloadFilename("README.md")).toBe("README.md");
  });

  it("ignores a trailing slash", () => {
    expect(knowledgeDownloadFilename("docs/guides/")).toBe("guides");
  });

  it("falls back to a placeholder when no name can be derived", () => {
    expect(knowledgeDownloadFilename("")).toBe("download");
    expect(knowledgeDownloadFilename("/")).toBe("download");
  });
});
