// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useTreeExpandStore } from "./tree-expand-store";

// Node 25 ships a partial `localStorage` shim under jsdom that's missing
// `clear`/`removeItem`; replace it with a real in-memory Storage so persist
// can round-trip values.
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

describe("tree expand store", () => {
  beforeEach(() => {
    useTreeExpandStore.setState({ expandedByWs: {} });
  });

  it("starts collapsed by default", () => {
    const { isExpanded } = useTreeExpandStore.getState();
    expect(isExpanded("ws-1", "docs")).toBe(false);
    expect(isExpanded("ws-1", "any/path")).toBe(false);
  });

  it("toggle expands and collapses a single folder", () => {
    const { toggle } = useTreeExpandStore.getState();

    toggle("ws-1", "docs");
    expect(useTreeExpandStore.getState().isExpanded("ws-1", "docs")).toBe(true);

    toggle("ws-1", "docs");
    expect(useTreeExpandStore.getState().isExpanded("ws-1", "docs")).toBe(false);
    // Pruning empty arrays keeps the persisted payload small.
    expect(useTreeExpandStore.getState().expandedByWs).toEqual({});
  });

  it("isolates expanded state per workspace", () => {
    const { toggle } = useTreeExpandStore.getState();
    toggle("ws-1", "docs");
    toggle("ws-2", "guides");

    const state = useTreeExpandStore.getState();
    expect(state.isExpanded("ws-1", "docs")).toBe(true);
    expect(state.isExpanded("ws-1", "guides")).toBe(false);
    expect(state.isExpanded("ws-2", "guides")).toBe(true);
    expect(state.isExpanded("ws-2", "docs")).toBe(false);
  });

  it("expandAll replaces the workspace's expanded set and dedupes paths", () => {
    const { toggle, expandAll } = useTreeExpandStore.getState();
    toggle("ws-1", "stale");
    toggle("ws-2", "kept");

    expandAll("ws-1", ["docs", "guides", "docs"]);

    const state = useTreeExpandStore.getState();
    expect(state.expandedByWs["ws-1"]).toEqual(["docs", "guides"]);
    expect(state.isExpanded("ws-1", "stale")).toBe(false);
    expect(state.isExpanded("ws-2", "kept")).toBe(true);
  });

  it("expandAll with no paths clears the workspace entry", () => {
    const { expandAll } = useTreeExpandStore.getState();
    expandAll("ws-1", ["docs"]);

    expandAll("ws-1", []);
    expect(useTreeExpandStore.getState().expandedByWs).toEqual({});

    const before = useTreeExpandStore.getState().expandedByWs;
    expandAll("ws-1", []);
    expect(useTreeExpandStore.getState().expandedByWs).toBe(before);
  });

  it("collapseAll clears one workspace without touching others", () => {
    const { expandAll, collapseAll } = useTreeExpandStore.getState();
    expandAll("ws-1", ["docs", "guides"]);
    expandAll("ws-2", ["archive"]);

    collapseAll("ws-1");

    const state = useTreeExpandStore.getState();
    expect(state.expandedByWs["ws-1"]).toBeUndefined();
    expect(state.expandedByWs["ws-2"]).toEqual(["archive"]);

    const before = state.expandedByWs;
    collapseAll("ws-1");
    expect(useTreeExpandStore.getState().expandedByWs).toBe(before);
  });
});