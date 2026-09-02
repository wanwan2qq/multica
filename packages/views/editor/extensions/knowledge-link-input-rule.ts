import { Extension, InputRule } from "@tiptap/core";

/**
 * Knowledge-link input rule — turns a `[[path]]` you type into a live
 * `kb:` link, so the description editor feels like the reply/comment path
 * (which transforms on every render).
 *
 * The read-only surface preprocesses `[[path]]` → `[path](kb:path)` before
 * render. The description editor is uncontrolled, so that preprocessing only
 * runs once at mount — a reference typed after mount would otherwise stay
 * literal text until the user saved and reloaded. This rule closes the gap.
 *
 * The href is percent-encoded (matching `preprocessKnowledgeLinks`) so paths
 * containing spaces or parentheses stay a valid markdown destination when the
 * description is serialized back to markdown. `setLink` is used (not raw
 * `insertContent`) after the Link extension is configured with `protocols: ["kb"]`
 * — see extensions/index.ts.
 */
export const KnowledgeLinkInputRule = Extension.create({
  name: "knowledgeLinkInputRule",

  addInputRules() {
    return [
      new InputRule({
        // Anchored at the cursor: fires when `]]` is typed, i.e. the reference
        // has just been completed. Lazy body so `[[a]]` never crosses into a
        // second `]]`.
        find: /\[\[([^\]\n]+?)\]\]$/,
        handler: ({ state, range, match, chain }) => {
          const path = match[1]?.trim();
          if (!path) return;

          // Never rewrite inside fenced code or inline code — mirrors the skip
          // rules in `preprocessKnowledgeLinks`.
          const { $from } = state.selection;
          if ($from.parent.type.name === "codeBlock") return;
          if ($from.marks().some((m) => m.type.name === "code")) return;

          // Replace the typed `[[path]]` with a link-marked text node. Built as
          // structured content (not via `setLink`, which is a no-op on the
          // collapsed selection after deleteRange). The `kb:` href renders as a
          // real `<a>` because the Link extension is configured with
          // `protocols: ["kb"]` — see extensions/index.ts. One undo step.
          chain()
            .deleteRange(range)
            .insertContent([
              {
                type: "text",
                text: path,
                marks: [{ type: "link", attrs: { href: `kb:${encodeURIComponent(path)}` } }],
              },
            ])
            .run();
        },
      }),
    ];
  },
});
