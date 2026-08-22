// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  filter = "",
  onFilterChange?: (next: string) => void,
) {
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <KnowledgeTree
        wsId={wsId}
        filePaths={SAMPLE_FILES}
        selectedPath={selectedPath}
        onSelect={onSelect}
        filter={filter}
        onFilterChange={onFilterChange}
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

  it("narrows the tree when a matching filter is passed in", () => {
    renderTree("", vi.fn(), "ws-1", "config");
    // Only the matching file is visible — siblings and unrelated branches
    // are pruned away.
    expect(screen.getByText("config.json")).toBeTruthy();
    expect(screen.queryByText("README.md")).toBeNull();
    expect(screen.queryByText("PRD.md")).toBeNull();
    expect(screen.getByText(/1 file matches?/)).toBeTruthy();
  });

  it("auto-expands ancestor folders so deep matches are visible", () => {
    renderTree("", vi.fn(), "ws-1", "config.json");
    // The match itself is visible because the prune kept the only dir with
    // surviving children (02-研发过程/), and the search-driven expanded set
    // opens its parents without a click.
    expect(screen.getByText("config.json")).toBeTruthy();
    // Sibling files outside the pruned subtree are gone.
    expect(screen.queryByText("README.md")).toBeNull();
    expect(screen.queryByText("_overview.md")).toBeNull();
  });

  it("shows a no-match empty state when the filter hits nothing", () => {
    renderTree("", vi.fn(), "ws-1", "this-does-not-exist-anywhere");
    expect(screen.getByText("No files match this filter.")).toBeTruthy();
    expect(screen.queryByText("README.md")).toBeNull();
  });

  it("clearing the filter restores the prior view", async () => {
    let filter = "config";
    const onFilterChange = (next: string) => {
      filter = next;
    };
    const { rerender } = render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("config.json")).toBeTruthy();
    expect(screen.queryByText("README.md")).toBeNull();

    // Simulate clearing the filter — the parent state setter clears and
    // re-renders with the empty filter, restoring the unfiltered view.
    filter = "";
    rerender(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("README.md")).toBeTruthy();
    expect(screen.queryByText(/file matches/)).toBeNull();
  });

  it("skips onChange while an IME is composing", () => {
    let filter = "";
    const onFilterChange = (next: string) => {
      filter = next;
    };
    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );
    const input = screen.getByLabelText("Filter knowledge base files");

    // Simulate IME keystrokes — each input event has nativeEvent.isComposing
    // true while the user is mid-pinyin (e.g. typing "zhongwen" for "中").
    // The handler must NOT propagate these intermediate values.
    fireEvent.input(input, { target: { value: "z" }, isComposing: true });
    fireEvent.input(input, { target: { value: "zh" }, isComposing: true });
    fireEvent.input(input, { target: { value: "zho" }, isComposing: true });
    fireEvent.input(input, { target: { value: "zhon" }, isComposing: true });
    expect(filter).toBe("");
  });

  it("flushes the committed value when IME composition ends", () => {
    let filter = "";
    const onFilterChange = (next: string) => {
      filter = next;
    };
    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );
    const input = screen.getByLabelText("Filter knowledge base files");

    // Mid-composition keystrokes should be ignored.
    fireEvent.input(input, { target: { value: "zhongwen" }, isComposing: true });
    expect(filter).toBe("");

    // When the IME commits, the final value lands via compositionend.
    fireEvent.compositionEnd(input, { target: { value: "中" } });
    expect(filter).toBe("中");
  });

  it("ignores a stale compositionend that arrives after the user clears the field", () => {
    let filter = "zhongwen";
    const onFilterChange = (next: string) => {
      filter = next;
    };
    const { rerender } = render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );
    const input = screen.getByLabelText("Filter knowledge base files");

    // User clears the filter via the X button — the controlled `filter` is
    // reset to "" and the component re-renders.
    filter = "";
    rerender(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );

    // Some IMEs fire compositionend with the cancelled partial value AFTER
    // the user already cleared the field. Because the handler compares
    // `next === value` and skips when they match, the stale event is
    // dropped — `filter` stays "".
    fireEvent.compositionEnd(input, { target: { value: "zhongwen" } });
    expect(filter).toBe("");
  });

  it("propagates non-IME typing to the filter", () => {
    let filter = "";
    const onFilterChange = (next: string) => {
      filter = next;
    };
    const { rerender } = render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );
    const input = screen.getByLabelText("Filter knowledge base files");

    fireEvent.input(input, { target: { value: "c" } });
    expect(filter).toBe("c");

    // Re-render so the component reflects the new filter and the input
    // receives it as a controlled value (jsdom doesn't update value without
    // a controlled rerender).
    rerender(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree
          wsId="ws-1"
          filePaths={SAMPLE_FILES}
          selectedPath=""
          onSelect={vi.fn()}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </I18nProvider>,
    );

    fireEvent.input(input, { target: { value: "co" } });
    expect(filter).toBe("co");
  });

  it("renders the search input with refined sidebar styling", () => {
    renderTree();
    const input = screen.getByLabelText("Filter knowledge base files");
    // h-8 height, refined border + bg pattern from the design plan.
    expect(input.className).toContain("h-8");
    expect(input.className).toContain("border-input/50");
    expect(input.className).toContain("bg-surface-hover");
    expect(input.className).toContain("focus-visible:border-input");
    expect(input.className).toContain("focus-visible:bg-background");
  });
});