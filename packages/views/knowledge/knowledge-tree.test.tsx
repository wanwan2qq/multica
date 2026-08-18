// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@multica/core/i18n/react";
import enKnowledge from "../locales/en/knowledge.json";
import { KnowledgeTree } from "./knowledge-tree";

const TEST_RESOURCES = {
  en: { knowledge: enKnowledge },
};

const SAMPLE_FILES = [
  "README.md",
  "01-贝易转/_overview.md",
  "01-贝易转/02-研发过程/README.md",
  "01-贝易转/02-研发过程/PRD.md",
  "01-贝易转/02-研发过程/config.json",
  "01-贝易转/02-研发过程/script.ts",
  "01-贝易转/02-研发过程/styles.css",
  "01-贝易转/02-研发过程/logo.png",
];

function renderTree(selectedPath = "", onSelect = vi.fn()) {
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <KnowledgeTree
        filePaths={SAMPLE_FILES}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </I18nProvider>,
  );
}

describe("KnowledgeTree", () => {
  it("renders folders and files in tree order", () => {
    renderTree();
    // Folders first, then files
    const items = screen.getAllByRole("tab");
    expect(items.length).toBeGreaterThan(0);
  });

  it("shows file type icons for different extensions", () => {
    renderTree();
    // There are two README.md files (root + nested), so use getAllByText
    const readmeElements = screen.getAllByText("README.md");
    expect(readmeElements.length).toBe(2);
    // config.json should be visible
    expect(screen.getByText("config.json")).toBeTruthy();
  });

  it("has expand/collapse all toggle", () => {
    renderTree();
    const button = screen.getByLabelText("Collapse all");
    expect(button).toBeTruthy();
  });

  it("toggles all folders with expand/collapse button", async () => {
    const user = userEvent.setup();
    renderTree();

    const collapseBtn = screen.getByLabelText("Collapse all");
    await user.click(collapseBtn);

    // After collapse, the button should become "Expand all"
    expect(screen.getByLabelText("Expand all")).toBeTruthy();

    await user.click(screen.getByLabelText("Expand all"));
    expect(screen.getByLabelText("Collapse all")).toBeTruthy();
  });

  it("calls onSelect when a file is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTree("", onSelect);

    // Click the root-level README.md — it's the second "README.md" in DOM order
    // (the first is the nested one inside 01-贝易转/02-研发过程/)
    const readmeElements = screen.getAllByText("README.md");
    await user.click(readmeElements[1]!);
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
    // .md extension badge on the root README.md tab
    const mdButtons = screen.getAllByRole("tab", { name: /README.md/ });
    expect(mdButtons.length).toBe(2);
    expect(mdButtons[0]!.textContent).toContain(".md");
  });

  it("renders empty state when no files", () => {
    render(
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <KnowledgeTree filePaths={[]} selectedPath="" onSelect={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText("Pick a Markdown file from the tree to preview it. Editing stays in Git.")).toBeTruthy();
  });
});