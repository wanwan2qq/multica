// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import enKnowledge from "../locales/en/knowledge.json";
import { BranchPicker } from "./branch-picker";

const TEST_RESOURCES = {
  en: { knowledge: enKnowledge },
};

// Mock the queries module so the test doesn't depend on @multica/core/api.
vi.mock("@multica/core/knowledge/queries", () => ({
  knowledgeBranchesOptions: (wsId: string) => ({
    queryKey: ["workspaces", wsId, "knowledge", "branches"],
    queryFn: () => branchesRef.current,
    enabled: true,
  }),
}));

const branchesRef = vi.hoisted(() => ({
  current: { branches: [] as string[], default_branch: "" } as {
    branches: string[];
    default_branch: string;
  },
}));

function renderPicker(
  value = "",
  onChange = vi.fn(),
  wsId = "ws-1",
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <QueryClientProvider client={client}>
        <BranchPicker wsId={wsId} value={value} onChange={onChange} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe("BranchPicker", () => {
  beforeEach(() => {
    branchesRef.current = { branches: [], default_branch: "" };
  });

  afterEach(() => {
    cleanup();
  });

  it("disables the trigger when the branches list is empty", () => {
    branchesRef.current = { branches: [], default_branch: "main" };
    renderPicker();
    const trigger = screen.getByLabelText("Knowledge base branch");
    expect(trigger).toBeTruthy();
    // The SelectTrigger is disabled while items are empty so the user can't
    // click into an empty menu.
    expect(trigger.hasAttribute("disabled")).toBe(true);
  });

  it("renders the default branch when no user override is set", async () => {
    branchesRef.current = {
      branches: ["main", "feature/x"],
      default_branch: "main",
    };
    const user = userEvent.setup();
    renderPicker("");
    await user.click(screen.getByLabelText("Knowledge base branch"));
    // Both branches are selectable; the default gets a trailing label.
    expect(screen.getAllByText("main").length).toBeGreaterThan(0);
    expect(screen.getByText("feature/x")).toBeTruthy();
    expect(screen.getAllByText(/default/).length).toBeGreaterThan(0);
  });

  it("calls onChange once when a branch is picked", async () => {
    branchesRef.current = {
      branches: ["main", "dev"],
      default_branch: "main",
    };
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPicker("", onChange);
    await user.click(screen.getByLabelText("Knowledge base branch"));
    await user.click(screen.getByText("dev"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("dev");
  });

  it("does not call onChange when the picker is disabled", async () => {
    branchesRef.current = { branches: [], default_branch: "main" };
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPicker("", onChange);
    // Click is a no-op while disabled — we just verify onChange isn't called.
    await user.click(screen.getByLabelText("Knowledge base branch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});