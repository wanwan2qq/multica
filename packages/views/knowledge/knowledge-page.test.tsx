// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import { ApiError } from "@multica/core/api";
import enCommon from "../locales/en/common.json";
import enKnowledge from "../locales/en/knowledge.json";
import enSkills from "../locales/en/skills.json";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { KnowledgePage } from "./knowledge-page";

const TEST_RESOURCES = {
  en: { common: enCommon, knowledge: enKnowledge, skills: enSkills },
};

const treeRef = vi.hoisted(() => ({
  current: {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined as unknown,
    error: null as unknown,
  },
}));
const fileRef = vi.hoisted(() => ({
  current: {
    isPending: false,
    isError: false,
    data: undefined as unknown,
    error: null as unknown,
  },
}));
const searchRef = vi.hoisted(() => ({ current: new URLSearchParams() }));
const replace = vi.hoisted(() => vi.fn());

vi.mock("@multica/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@multica/core/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@multica/core/paths")>()),
  useWorkspacePaths: () => ({
    settings: () => "/acme/settings",
    knowledge: () => "/acme/knowledge",
  }),
}));
vi.mock("@multica/core/knowledge/queries", () => ({
  knowledgeTreeOptions: () => ({ queryKey: ["knowledge", "tree"] }),
  knowledgeFileOptions: () => ({ queryKey: ["knowledge", "file"] }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: string[] }) =>
      queryKey.includes("tree") ? treeRef.current : fileRef.current,
  };
});
vi.mock("../rich-content", () => ({
  RichContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

function renderPage() {
  const nav: NavigationAdapter = {
    pathname: "/acme/knowledge",
    searchParams: searchRef.current,
    push: vi.fn(),
    replace,
    back: vi.fn(),
    getShareableUrl: (path) => path,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <QueryClientProvider client={client}>
        <NavigationProvider value={nav}>
          <KnowledgePage />
        </NavigationProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe("KnowledgePage", () => {
  beforeEach(() => {
    replace.mockReset();
    searchRef.current = new URLSearchParams();
    treeRef.current = {
      isPending: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    };
    fileRef.current = {
      isPending: false,
      isError: false,
      data: undefined,
      error: null,
    };
  });

  it("asks the user to label a repo when none is configured", () => {
    treeRef.current = {
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: new ApiError("missing", 404, "Not Found", {
        code: "knowledge_repo_not_configured",
      }),
    };
    renderPage();
    expect(screen.getByText("No knowledge repository")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open repositories" })).toHaveAttribute(
      "href",
      "/acme/settings?tab=repositories",
    );
  });

  it("previews markdown from the remote tree", () => {
    searchRef.current = new URLSearchParams("path=README.md");
    treeRef.current = {
      isPending: false,
      isError: false,
      isSuccess: true,
      data: {
        repo_url: "https://github.com/acme/kb.git",
        description: "知识库",
        ref: "main",
        browse_url: "https://github.com/acme/kb/tree/main",
        provider: "github",
        entries: [{ path: "README.md", type: "blob" }],
      },
      error: null,
    };
    fileRef.current = {
      isPending: false,
      isError: false,
      data: {
        path: "README.md",
        ref: "main",
        browse_url: "https://github.com/acme/kb/blob/main/README.md",
        media: "markdown",
        truncated: false,
        size: 8,
        content: "# Hello KB",
      },
      error: null,
    };
    renderPage();
    expect(screen.getByText("# Hello KB")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });
});
