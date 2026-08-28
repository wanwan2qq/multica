// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import { ApiError } from "@multica/core/api";
import enCommon from "../locales/en/common.json";
import enKnowledge from "../locales/en/knowledge.json";
import enSkills from "../locales/en/skills.json";
import { useTreeExpandStore } from "@multica/core/knowledge/stores/tree-expand-store";
import { useKnowledgePathStore } from "@multica/core/knowledge/stores/knowledge-path-store";
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
    isFetching: false,
    data: undefined as unknown,
    error: null as unknown,
  },
}));
const fileRef = vi.hoisted(() => ({
  current: {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined as unknown,
    error: null as unknown,
  },
}));
const branchesRef = vi.hoisted(() => ({
  current: {
    isPending: false,
    isError: false,
    isFetching: false,
    data: { branches: [] as string[], default_branch: "" },
  },
}));
const seenKeys = vi.hoisted(() => ({ current: [] as unknown[][] }));
const searchRef = vi.hoisted(() => ({ current: new URLSearchParams() }));
const replace = vi.hoisted(() => vi.fn());
const refByWsRef = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const invalidateQueries = vi.hoisted(() => vi.fn());

vi.mock("@multica/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@multica/core/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@multica/core/paths")>()),
  useWorkspacePaths: () => ({
    settings: () => "/acme/settings",
    knowledge: () => "/acme/knowledge",
  }),
}));
vi.mock("@multica/core/knowledge/queries", () => ({
  knowledgeKeys: {
    all: (wsId: string) => ["workspaces", wsId, "knowledge"] as const,
    branches: (wsId: string) => ["workspaces", wsId, "knowledge", "branches"] as const,
    tree: (wsId: string, ref: string) => ["workspaces", wsId, "knowledge", "tree", ref] as const,
    file: (wsId: string, ref: string, path: string) =>
      ["workspaces", wsId, "knowledge", "file", ref, path] as const,
  },
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
      selector({ refByWs: refByWsRef.current }),
    {
      getState: () => ({
        refByWs: refByWsRef.current,
        setRef: vi.fn(),
        resetRef: vi.fn(),
      }),
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
    useQueryClient: () => ({
      invalidateQueries,
    }),
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
    invalidateQueries.mockReset();
    searchRef.current = new URLSearchParams();
    seenKeys.current = [];
    refByWsRef.current = {};
    globalThis.localStorage?.clear?.();
    useTreeExpandStore.setState({ expandedByWs: {} });
    useKnowledgePathStore.setState({ pathByWs: {} });
    treeRef.current = {
      isPending: false,
      isError: false,
      isSuccess: false,
      isFetching: false,
      data: undefined,
      error: null,
    };
    fileRef.current = {
      isPending: false,
      isError: false,
      isFetching: false,
      data: undefined,
      error: null,
    };
    branchesRef.current = {
      isPending: false,
      isError: false,
      isFetching: false,
      data: { branches: [], default_branch: "" },
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
    branchesRef.current = {
      isPending: false,
      isError: false,
      data: { branches: ["main"], default_branch: "main" },
    };
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

  it("renders html files in a full iframe without sandbox", () => {
    searchRef.current = new URLSearchParams("path=page.html");
    branchesRef.current = {
      isPending: false,
      isError: false,
      data: { branches: ["main"], default_branch: "main" },
    };
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
    expect(iframe?.getAttribute("sandbox")).toBeNull();
    expect(iframe?.getAttribute("title")).toBe("page.html");
    expect(iframe?.getAttribute("srcDoc")).toContain("Hello HTML");
    expect(screen.queryByText(/HTML preview is sandboxed/)).toBeNull();
    expect(screen.queryByText(/沙箱/)).toBeNull();
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

  it("renders a skeleton instead of stale tree data when activeRef does not match data.ref", () => {
    // Server has cached a `main` tree (e.g. from a prior mount) but the
    // user's persisted branch is `dev`. activeRef resolves to "dev" via
    // useRefStore; treeQuery.data.ref === "main" doesn't match → guard
    // treats this as "still loading" and renders the skeleton.
    refByWsRef.current = { "ws-1": "dev" };
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
    renderPage();
    // No README.md tab visible — the tree panel is the loading skeleton.
    expect(screen.queryByRole("tab", { name: /README\.md/ })).toBeNull();
    // Header shows the target branch while the new tree is loading.
    expect(screen.getAllByText("dev").length).toBeGreaterThan(0);
    expect(screen.queryByText("main")).toBeNull();
  });

  it("renders a skeleton instead of stale file data when activeRef does not match", () => {
    branchesRef.current = {
      isPending: false,
      isError: false,
      data: { branches: ["main"], default_branch: "main" },
    };
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
    // fileRef holds stale data for `main` but the user switched to `dev`.
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
        content: "# Stale main content",
      },
      error: null,
    };
    refByWsRef.current = { "ws-1": "dev" };
    renderPage();
    // The stale main content does NOT appear in the file panel.
    expect(screen.queryByText("# Stale main content")).toBeNull();
  });

  it("restores the last opened file when the URL drops ?path= on re-entry", () => {
    // Sidebar re-entry / refresh navigates to the bare knowledge path, so the
    // URL no longer carries ?path=. The auto-redirect must restore the file
    // the user last opened from the persisted store rather than the overview.
    branchesRef.current = {
      isPending: false,
      isError: false,
      data: { branches: ["main"], default_branch: "main" },
    };
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
        entries: [
          { path: "notes/foo.md", type: "blob" },
          { path: "README.md", type: "blob" },
        ],
      },
      error: null,
    };
    useKnowledgePathStore.setState({ pathByWs: { "ws-1": "notes/foo.md" } });
    renderPage();
    // URLSearchParams encodes the slash in the path (notes%2Ffoo.md); the
    // server decodes it back to notes/foo.md.
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("path=notes%2Ffoo.md"),
    );
    // It must NOT have fallen back to the root README overview.
    expect(replace).not.toHaveBeenCalledWith(
      expect.stringContaining("path=README.md"),
    );
  });

  it("falls back to the default overview when the stored path is gone on the current ref", () => {
    branchesRef.current = {
      isPending: false,
      isError: false,
      data: { branches: ["main"], default_branch: "main" },
    };
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
    useKnowledgePathStore.setState({ pathByWs: { "ws-1": "gone.md" } });
    renderPage();
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("path=README.md"),
    );
  });

  it("does not wipe ?path= when the URL already carries it", () => {
    branchesRef.current = {
      isPending: false,
      isError: false,
      data: { branches: ["main"], default_branch: "main" },
    };
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
        entries: [{ path: "bar.md", type: "blob" }],
      },
      error: null,
    };
    searchRef.current = new URLSearchParams("path=bar.md");
    useKnowledgePathStore.setState({ pathByWs: { "ws-1": "foo.md" } });
    renderPage();
    // The URL is intact, so the auto-redirect effect must stay silent — it
    // should not replace it with the stored path or the overview.
    expect(replace).not.toHaveBeenCalledWith(
      expect.stringContaining("path="),
    );
  });

  it("does not redirect via the auto-default effect until the new ref's tree lands", () => {
    // First mount: tree data is for `main`, but the user has persisted
    // `dev` as their override. The auto-redirect effect (which would
    // otherwise set ?path= to the new ref's overview) must NOT fire
    // based on the stale main tree.
    refByWsRef.current = { "ws-1": "dev" };
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
        entries: [
          { path: "main-only.md", type: "blob" },
        ],
      },
      error: null,
    };
    renderPage();
    // The page should be in the skeleton state, NOT have navigated to
    // `?path=main-only.md` based on stale data.
    expect(replace).not.toHaveBeenCalledWith(
      expect.stringContaining("path=main-only.md"),
    );
  });

  it("invalidates all knowledge queries when Refresh is clicked", async () => {
    const user = userEvent.setup();
    branchesRef.current = {
      isPending: false,
      isError: false,
      isFetching: false,
      data: { branches: ["main"], default_branch: "main" },
    };
    treeRef.current = {
      isPending: false,
      isError: false,
      isSuccess: true,
      isFetching: false,
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
    searchRef.current = new URLSearchParams("path=README.md");
    fileRef.current = {
      isPending: false,
      isError: false,
      isFetching: false,
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
    await user.click(screen.getByRole("button", { name: "Refresh knowledge base from Git" }));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["workspaces", "ws-1", "knowledge"],
    });
  });
});
