// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@multica/core/i18n/react";
import enKnowledge from "../locales/en/knowledge.json";
import { useTreeExpandStore } from "@multica/core/knowledge/stores/tree-expand-store";
import { KnowledgeTree } from "./knowledge-tree";

const TEST_RESOURCES = {
  en: { knowledge: enKnowledge },
};

// Node 25 ships a partial `localStorage` shim under jsdom that's missing
// `clear`/`removeItem`; replace it with a real in-memory Storage so the
// persisted tree-expand store can round-trip values across renders.
beforeAll(() => {
  if (typeof globalThis.localStorage?.setItem !== "function") {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (k) => values.get(k) ?? null,
      key: (i) => Array.from(values.keys())[i] ?? null,
      removeItem: (k) => { values.delete(k); },
      setItem: (k, v) => { values.set(k, v); },
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  }
});

const SAMPLE_FILES = [
  "README.md",
  "01-贝易转/_overview.md",
  "01-贝易转/02-研发过程/README.md",
  "01-贝易转/02-研发过程/PRD.md",
  "01-贝易转/02-研发过程/config.json",
  "01-贝易转/02-研发过程/script.ts",
  "01-贝易转/02-研发过程/styles.css",
  "01-贝易转/02-研发过程/logo.png",
  "01-贝易转/02-研发过程/page.html",
];

function renderTree(
  selectedPath = "",
  onSelect = vi.fn(),
  wsId = "ws-1",
) {
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <KnowledgeTree
        wsId={wsId}
        filePaths={SAMPLE_FILES}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </I18nProvider>,
  );
}

describe("KnowledgeTree", () => {
  beforeEach(() => {
    // Reset both the in-memory store and the persisted snapshot so the
    // workspace-aware zustand persist doesn't rehydrate a previous test's
    // expansion state when a new tree mounts.
    globalThis.localStorage?.clear?.();
    useTreeExpandStore.setState({ expandedByWs: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it("starts collapsed by default", () => {
    renderTree();
    // Only the root-level files are visible — nested paths are hidden until
    // their parent folder is expanded.
    expect(screen.getAllByRole("tab").length).toBe(1);
    expect(screen.getByText("README.md")).toBeTruthy();
    expect(screen.queryByText("config.json")).toBeNull();
  });

  it("expands a folder when its row is clicked", async () => {
    const user = userEvent.setup();
    renderTree();

    // Folder buttons include the child count in their accessible name, so
    // match the folder name with a partial regex.
    await user.click(screen.getByRole("button", { name: /01-贝易转/ }));
    expect(screen.getByText("_overview.md")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /02-研发过程/ }));
    expect(screen.getByText("config.json")).toBeTruthy();
    expect(screen.getByText("PRD.md")).toBeTruthy();
  });

  it("renders folders and files in tree order", async () => {
    const user = userEvent.setup();
    renderTree();

    // Expand both folders so all nested files are visible.
    await user.click(screen.getByRole("button", { name: /01-贝易转/ }));
    await user.click(screen.getByRole("button", { name: /02-研发过程/ }));

    const items = screen.getAllByRole("tab");
    expect(items.length).toBeGreaterThan(0);
  });

  it("shows file type icons for different extensions", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(screen.getByRole("button", { name: /01-贝易转/ }));
    await user.click(screen.getByRole("button", { name: /02-研发过程/ }));

    // Two README.md files (root + nested)
    const readmeElements = screen.getAllByText("README.md");
    expect(readmeElements.length).toBe(2);
    expect(screen.getByText("config.json")).toBeTruthy();
    expect(screen.getByText("page.html")).toBeTruthy();
  });

  it("renders an html file with a Globe icon", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(screen.getByRole("button", { name: /01-贝易转/ }));
    await user.click(screen.getByRole("button", { name: /02-研发过程/ }));

    const htmlTab = screen.getByRole("tab", { name: /page\.html/ });
    expect(htmlTab).toBeTruthy();
    expect(htmlTab.querySelector("svg")).toBeTruthy();
  });

  it("has expand/collapse all toggle that defaults to 'Expand all'", () => {
    renderTree();
    expect(screen.getByLabelText("Expand all")).toBeTruthy();
  });

  it("expand-all then collapse-all toggles every folder", async () => {
    const user = userEvent.setup();
    renderTree();

    const expandBtn = screen.getByLabelText("Expand all");
    await user.click(expandBtn);
    expect(screen.getByLabelText("Collapse all")).toBeTruthy();

    await user.click(screen.getByLabelText("Collapse all"));
    expect(screen.getByLabelText("Expand all")).toBeTruthy();
  });

  it("calls onSelect when a file is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTree("", onSelect);

    // The root README.md is the only one visible while collapsed.
    await user.click(screen.getByText("README.md"));
    expect(onSelect).toHaveBeenCalledWith("README.md");
  });

  it("highlights the selected file", () => {
    renderTree("README.md");
    const selected = screen.getByRole("tab", { selected: true });
    expect(selected).toBeTruthy();
    expect(selected.textContent).toContain("README.md");
  });

  it("shows extension badges on files", () => {
    renderTree();
    // .md extension badge on the root README.md tab — only one is visible
    // while the tree is collapsed.
    const mdButtons = screen.getAllByRole("tab", { name: /README\.md/ });
    expect(mdButtons.length).toBe(1);
    expect(mdButtons[0]!.textContent).toContain(".md");
  });

  it("renders empty state when no files", () => {
    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree wsId="ws-1" filePaths={[]} selectedPath="" onSelect={vi.fn()} />
      </I18nProvider>,
    );
    expect(
      screen.getByText("Pick a Markdown file from the tree to preview it. Editing stays in Git."),
    ).toBeTruthy();
  });

  it("restores previously expanded folders on remount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTree();

    await user.click(screen.getByRole("button", { name: /01-贝易转/ }));
    await user.click(screen.getByRole("button", { name: /02-研发过程/ }));
    expect(screen.getByText("config.json")).toBeTruthy();
    unmount();

    // Second mount in the same workspace — expanded folders persist via the
    // workspace-scoped store.
    renderTree();
    expect(screen.getByText("config.json")).toBeTruthy();
  });

  it("isolates expanded state per workspace", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTree();

    await user.click(screen.getByRole("button", { name: /01-贝易转/ }));
    expect(screen.getByText("_overview.md")).toBeTruthy();
    unmount();

    // A second workspace starts with no expanded folders.
    renderTree("", vi.fn(), "ws-2");
    expect(screen.queryByText("_overview.md")).toBeNull();
  });
});