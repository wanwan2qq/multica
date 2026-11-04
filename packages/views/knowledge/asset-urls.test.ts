import { describe, expect, it } from "vitest";
import {
  encodeKnowledgeRepoPath,
  knowledgeAssetURL,
  knowledgeAssetsBaseHref,
  resolveAssetsBase,
  resolveKnowledgeRelativePath,
} from "./asset-urls";

const SITE_RELATIVE = "/api/workspaces/ws/knowledge/assets/token/";

describe("resolveAssetsBase", () => {
  it("keeps a site-relative base relative when the API is same-origin", () => {
    expect(resolveAssetsBase("", SITE_RELATIVE)).toBe(
      "/api/workspaces/ws/knowledge/assets/token",
    );
  });

  it("prefixes the API base for desktop and split-origin web", () => {
    expect(resolveAssetsBase("http://10.15.42.27:8082", SITE_RELATIVE)).toBe(
      "http://10.15.42.27:8082/api/workspaces/ws/knowledge/assets/token",
    );
  });

  it("tolerates slashes on either side", () => {
    expect(resolveAssetsBase("https://api.test/", SITE_RELATIVE)).toBe(
      "https://api.test/api/workspaces/ws/knowledge/assets/token",
    );
  });

  it("returns empty when the server sent no base", () => {
    expect(resolveAssetsBase("https://api.test", "")).toBe("");
    expect(resolveAssetsBase("https://api.test", undefined)).toBe("");
  });
});

describe("encodeKnowledgeRepoPath", () => {
  it("encodes each segment and keeps the separators", () => {
    expect(encodeKnowledgeRepoPath("docs/图/a b.png")).toBe(
      "docs/%E5%9B%BE/a%20b.png",
    );
  });

  it("escapes parentheses so a markdown destination cannot end early", () => {
    expect(encodeKnowledgeRepoPath("img/chart (1).png")).toBe(
      "img/chart%20%281%29.png",
    );
  });
});

describe("knowledgeAssetURL", () => {
  it("joins the base and the encoded path", () => {
    expect(
      knowledgeAssetURL("/api/workspaces/ws/knowledge/assets/token", "img/a.png"),
    ).toBe("/api/workspaces/ws/knowledge/assets/token/img/a.png");
  });

  it("returns empty without a base so callers can fall back", () => {
    expect(knowledgeAssetURL("", "img/a.png")).toBe("");
  });
});

describe("knowledgeAssetsBaseHref", () => {
  it("ends at the document's directory with a trailing slash", () => {
    expect(
      knowledgeAssetsBaseHref("/api/assets/token", "docs/guides/intro.html"),
    ).toBe("/api/assets/token/docs/guides/");
  });

  it("handles a document at the repository root", () => {
    expect(knowledgeAssetsBaseHref("/api/assets/token", "index.html")).toBe(
      "/api/assets/token/",
    );
  });

  it("encodes non-ASCII directories", () => {
    expect(knowledgeAssetsBaseHref("/api/assets/token", "文档/首页.html")).toBe(
      "/api/assets/token/%E6%96%87%E6%A1%A3/",
    );
  });
});

describe("resolveKnowledgeRelativePath", () => {
  it("resolves against the document's directory", () => {
    expect(resolveKnowledgeRelativePath("docs/a.md", "./img/x.png")).toBe(
      "docs/img/x.png",
    );
  });

  it("walks up with ..", () => {
    expect(resolveKnowledgeRelativePath("docs/sub/a.md", "../../assets/x.css")).toBe(
      "assets/x.css",
    );
  });

  it("treats a leading slash as repository root", () => {
    expect(resolveKnowledgeRelativePath("docs/a.md", "/brand/logo.svg")).toBe(
      "brand/logo.svg",
    );
  });

  it("does not walk above the repository root", () => {
    expect(resolveKnowledgeRelativePath("a.md", "../../../etc/passwd")).toBe(
      "etc/passwd",
    );
  });
});
