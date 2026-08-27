import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../../platform/workspace-storage";
import { defaultStorage } from "../../platform/storage";

/**
 * Per-user × per-workspace last-opened knowledge file path.
 *
 * The knowledge page renders its content purely from the URL `?path=` so
 * links, refresh, and cross-page navigation all share one view. But the
 * sidebar nav href is a bare `/{slug}/knowledge` (no query), so every
 * re-entry through the sidebar drops the selection — and the page's
 * auto-redirect then lands on the root overview. This store remembers the
 * most recent file the user actually opened so the page can restore it when
 * the URL lacks `?path=`, instead of resetting to the overview.
 *
 * Persisted so the open file also survives a refresh / app restart. A path
 * that no longer exists on the current branch is ignored at restore time and
 * the page falls back to its default overview.
 */
export interface KnowledgePathStore {
  pathByWs: Record<string, string>;
  setPath: (wsId: string, path: string) => void;
  resetPath: (wsId: string) => void;
}

export const useKnowledgePathStore = create<KnowledgePathStore>()(
  persist(
    (set) => ({
      pathByWs: {},
      setPath: (wsId, path) =>
        set((s) => {
          if (path === "") {
            if (!(wsId in s.pathByWs)) return s;
            const { [wsId]: _, ...rest } = s.pathByWs;
            return { pathByWs: rest };
          }
          return { pathByWs: { ...s.pathByWs, [wsId]: path } };
        }),
      resetPath: (wsId) =>
        set((s) => {
          if (!(wsId in s.pathByWs)) return s;
          const { [wsId]: _, ...rest } = s.pathByWs;
          return { pathByWs: rest };
        }),
    }),
    {
      name: "multica_knowledge_path",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
    },
  ),
);

registerForWorkspaceRehydration(() => useKnowledgePathStore.persist.rehydrate());
