import { cn } from "@multica/ui/lib/utils";

/**
 * Reading measure for the knowledge content column.
 *
 * Callers add their own vertical padding; this only decides how wide the
 * column is allowed to grow inside the pane it was given.
 *
 * `96ch` is the measure the reader has always used and stays the default.
 * `120ch` is the full-screen one: with the tree and the nav gone the column
 * sits in a much wider pane, where keeping `96ch` reads as a narrow strip
 * floating in the middle. Widening spends that space without stretching the
 * line past a comfortable measure.
 */
export function readingWidthClass(fullscreen: boolean): string {
  return cn(
    "mx-auto w-full",
    fullscreen ? "max-w-[120ch]" : "max-w-[96ch]",
  );
}
