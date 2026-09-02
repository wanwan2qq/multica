import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createEditorExtensions } from ".";
import { parseMarkdownChunked, type MarkdownManagerLike } from "../utils/parse-markdown-chunked";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

function makeProductionEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createEditorExtensions({
      placeholder: "",
      disableMentions: true,
      enableSlashCommands: false,
      onUploadFileRef: { current: undefined },
    }),
  });
}

/** Type char-by-char through handleTextInput so input rules fire. */
function typeText(ed: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = ed.state.selection;
    const handled = ed.view.someProp("handleTextInput", (handler) =>
      handler(ed.view, from, to, ch, () => ed.state.tr),
    );
    if (!handled) {
      ed.view.dispatch(ed.state.tr.insertText(ch, from, to));
    }
  }
}

function linkHref(ed: Editor): string | null {
  let href: string | null = null;
  const walk = (n: { marks?: Array<{ type: string; attrs?: { href?: string } }>; content?: unknown[] }) => {
    if (n.marks?.some((m) => m.type === "link" && m.attrs?.href != null)) {
      href = n.marks.find((m) => m.type === "link")?.attrs?.href ?? null;
      return;
    }
    n.content?.forEach((c) => walk(c as never));
  };
  walk(ed.getJSON() as never);
  return href;
}

describe("knowledge link input rule", () => {
  it("turns a typed `[[path]]` into a live kb: link", () => {
    editor = makeProductionEditor();

    typeText(editor, "see [[docs/foo.md]]");

    expect(linkHref(editor)).toBe("kb:docs%2Ffoo.md");
    expect(editor.getText()).toContain("docs/foo.md");
    expect(editor.getHTML()).toContain('href="kb:docs%2Ffoo.md"');
    expect(editor.getMarkdown()).toBe("see [[docs/foo.md]]");
  });

  it("percent-encodes paths with spaces and keeps the raw label", () => {
    editor = makeProductionEditor();

    typeText(editor, "[[my docs/readme.md]]");

    expect(linkHref(editor)).toBe("kb:my%20docs%2Freadme.md");
    expect(editor.getText()).toContain("my docs/readme.md");
  });

  it("renders a kb: link mark with a real href (isAllowedUri allows kb:)", () => {
    editor = makeProductionEditor();

    typeText(editor, "[[docs/foo.md]]");

    // Without `protocols: ["kb"]`, Tiptap's Link renders `<a href="">` and the
    // click handler (which reads getAttribute("href")) would see an empty href.
    expect(editor.getHTML()).toContain('href="kb:docs%2Ffoo.md"');
    expect(editor.getHTML()).not.toContain('href=""');
  });

  it("renders a persisted `[path](kb:path)` markdown link with a real href on mount", () => {
    editor = makeProductionEditor();

    // The reload path: `preprocessKnowledgeLinks` converts a saved literal
    // `[[path]]` into `[path](kb:path)`, which the editor parses via the Markdown
    // manager and mounts (the same parseMarkdownChunked path ContentEditor uses).
    const manager = (editor.storage as { markdown?: { manager?: MarkdownManagerLike } })
      .markdown?.manager;
    expect(manager).toBeTruthy();
    const doc = parseMarkdownChunked(manager!, "see [docs/foo.md](kb:docs%2Ffoo.md)");
    editor.commands.setContent(doc, { emitUpdate: false });

    expect(editor.getHTML()).toContain('href="kb:docs%2Ffoo.md"');
    expect(editor.getHTML()).not.toContain('href=""');
  });

  it("renders preprocessed kb links via the ContentEditor contentType:markdown path", () => {
    editor = makeProductionEditor();

    editor.commands.setContent("see [docs/foo.md](kb:docs%2Ffoo.md)", {
      emitUpdate: false,
      contentType: "markdown",
    });

    expect(editor.getHTML()).toContain('href="kb:docs%2Ffoo.md"');
    expect(editor.getHTML()).not.toContain("[[docs/foo.md]]");
  });

  it("renders raw `[[path]]` via contentType:markdown once a wiki tokenizer is registered", () => {
    editor = makeProductionEditor();

    editor.commands.setContent("see [[docs/foo.md]]", {
      emitUpdate: false,
      contentType: "markdown",
    });

    expect(editor.getHTML()).toContain('href="kb:docs%2Ffoo.md"');
    expect(editor.getHTML()).not.toContain("[[docs/foo.md]]");
  });

  it("leaves a `[[path]]` typed inside a fenced code block as literal text", () => {
    editor = makeProductionEditor();

    // Open a code block (``` + Enter), type the reference, close it.
    typeText(editor, "```");
    editor.commands.insertContent("\n[[docs/foo.md]]\n");
    typeText(editor, "```");

    const html = editor.getHTML();
    expect(html).not.toContain('href="kb:');
    expect(html).toContain("[[docs/foo.md]]");
  });
});
