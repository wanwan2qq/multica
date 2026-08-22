// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import { ApiError } from "@multica/core/api";
import enCommon from "../locales/en/common.json";
import enKnowledge from "../locales/en/knowledge.json";
import enSkills from "../locales/en/skills.json";
import { useTreeExpandStore } from "@multica/core/knowledge/stores/tree-expand-store";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { KnowledgePage } from "./knowledge-page";

// react-resizable-panels relies on layout-side observers (`mountGroup` exercises
// `IntersectionObserver` / `ResizeObserver` to bootstrap drag handles) that
// jsdom does not provide. Pass the real exports through and stub only the
// primitives + `useDefaultLayout` so the resizable shell renders without
// DOM measurement.
vi.mock("react-resizable-panels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-resizable-panels")>();
  return {
    ...actual,
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Separator: () => null,
    useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: vi.fn() }),
  };
});

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
const branchesRef = vi.hoisted(() => ({
  current: {
    isPending: false,
    isError: false,
    data: { branches: [] as string[], default_branch: "" },
  },
}));
const seenKeys = vi.hoisted(() => ({ current: [] as unknown[][] }));
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
  knowledgeBranchesOptions: () => ({ queryKey: ["knowledge", "branches"] }),
  knowledgeTreeOptions: (_wsId: string, ref: string) => ({
    queryKey: ["knowledge", "tree", ref],
  }),
  knowledgeFileOptions: (_wsId: string, ref: string, _path: string) => ({
    queryKey: ["knowledge", "file", ref, _path],
  }),
}));
vi.mock("@multica/core/knowledge/stores/ref-store", () => ({
  useRefStore: Object.assign(
    (selector: (s: { refByWs: Record<string, string> }) => unknown) =>
      selector({ refByWs: {} }),
    {
      getState: () => ({ setRef: vi.fn(), resetRef: vi.fn() }),
      setState: vi.fn(),
    },
  ),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      seenKeys.current.push([...queryKey]);
      const key = Array.isArray(queryKey) ? queryKey : [];
      if (key.includes("branches")) return branchesRef.current;
      if (key.includes("tree")) return treeRef.current;
      return fileRef.current;
    },
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
    seenKeys.current = [];
    globalThis.localStorage?.clear?.();
    useTreeExpandStore.setState({ expandedByWs: {} });
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

  afterEach(() => {
    cleanup();
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
    const links = screen.getAllByRole("button", { name: "Open repositories" });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute(
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

  it("renders html files in a sandboxed iframe", () => {
    searchRef.current = new URLSearchParams("path=page.html");
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
        entries: [{ path: "page.html", type: "blob" }],
      },
      error: null,
    };
    fileRef.current = {
      isPending: false,
      isError: false,
      data: {
        path: "page.html",
        ref: "main",
        browse_url: "https://github.com/acme/kb/blob/main/page.html",
        media: "html",
        truncated: false,
        size: 21,
        content: "<p>Hello HTML</p>",
      },
      error: null,
    };
    renderPage();
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-popups");
    expect(iframe?.getAttribute("title")).toBe("page.html");
    expect(iframe?.getAttribute("srcDoc")).toContain("Hello HTML");
    expect(
      screen.getByText(/HTML preview is sandboxed/),
    ).toBeTruthy();
  });

  it("passes wsId + activeRef into the knowledge tree query key", () => {
    branchesRef.current = {
      isPending: false,
      isError: false,
      data: { branches: ["main", "dev"], default_branch: "main" },
    };
    seenKeys.current = [];
    renderPage();
    const treeKey = seenKeys.current.find((k) => k.includes("tree"));
    expect(treeKey).toBeDefined();
    // The tree query key embeds the active ref so switching ref invalidates
    // the cache. activeRef resolves to "main" because the user override is
    // empty and branchesQuery.data.default_branch === "main".
    expect(treeKey).toContain("main");
  });
});
