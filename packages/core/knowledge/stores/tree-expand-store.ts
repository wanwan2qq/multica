import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../../platform/workspace-storage";
import { defaultStorage } from "../../platform/storage";

/**
 * Tracks which knowledge-tree folders are expanded, keyed by workspace ID.
 * Only expanded paths are persisted — collapsed is the default state, so we
 * store the positive set (inverse of the comment-collapse pattern).
 */
export interface TreeExpandStore {
  expandedByWs: Record<string, string[]>;
  isExpanded: (wsId: string, path: string) => boolean;
  toggle: (wsId: string, path: string) => void;
  /** Replace the workspace's expanded set with `paths` (unfold-all). */
  expandAll: (wsId: string, paths: readonly string[]) => void;
  /** Clear the workspace's expanded set (fold-all). */
  collapseAll: (wsId: string) => void;
}

export const useTreeExpandStore = create<TreeExpandStore>()(
  persist(
    (set, get) => ({
      expandedByWs: {},
      isExpanded: (wsId, path) => {
        const paths = get().expandedByWs[wsId];
        return paths ? paths.includes(path) : false;
      },
      toggle: (wsId, path) =>
        set((s) => {
          const current = s.expandedByWs[wsId] ?? [];
          const isCurrentlyExpanded = current.includes(path);
          if (isCurrentlyExpanded) {
            const next = current.filter((p) => p !== path);
            if (next.length === 0) {
              const { [wsId]: _, ...rest } = s.expandedByWs;
              return { expandedByWs: rest };
            }
            return { expandedByWs: { ...s.expandedByWs, [wsId]: next } };
          }
          return { expandedByWs: { ...s.expandedByWs, [wsId]: [...current, path] } };
        }),
      expandAll: (wsId, paths) =>
        set((s) => {
          if (paths.length === 0) {
            if (!(wsId in s.expandedByWs)) return s;
            const { [wsId]: _, ...rest } = s.expandedByWs;
            return { expandedByWs: rest };
          }
          return { expandedByWs: { ...s.expandedByWs, [wsId]: [...new Set(paths)] } };
        }),
      collapseAll: (wsId) =>
        set((s) => {
          if (!(wsId in s.expandedByWs)) return s;
          const { [wsId]: _, ...rest } = s.expandedByWs;
          return { expandedByWs: rest };
        }),
    }),
    {
      name: "multica_knowledge_tree_expand",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
    },
  ),
);

registerForWorkspaceRehydration(() => useTreeExpandStore.persist.rehydrate());