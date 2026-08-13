/**
 * Extra workspace-nav items contributed by fork features.
 *
 * Host concatenates this list in `app-sidebar.tsx` (search KB-HOOK).
 * Keep this file small so `git rebase upstream/main` conflicts stay here,
 * not in the upstream sidebar.
 */
export const pluginWorkspaceNavItems: Array<{
  key: "knowledge";
  labelKey: "knowledge";
}> = [
  // KB-HOOK: workspace knowledge base (read-only Git remote browser)
  { key: "knowledge", labelKey: "knowledge" },
];
