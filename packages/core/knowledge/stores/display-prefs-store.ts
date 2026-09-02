import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../../platform/workspace-storage";
import { defaultStorage } from "../../platform/storage";

/** Per-workspace knowledge-base browse preferences (local only). */
export interface DisplayPrefsStore {
  hideDotPrefixedByWs: Record<string, boolean>;
  setHideDotPrefixed: (wsId: string, hide: boolean) => void;
}

export const useDisplayPrefsStore = create<DisplayPrefsStore>()(
  persist(
    (set) => ({
      hideDotPrefixedByWs: {},
      setHideDotPrefixed: (wsId, hide) =>
        set((s) => {
          if (!hide) {
            if (!(wsId in s.hideDotPrefixedByWs)) return s;
            const { [wsId]: _, ...rest } = s.hideDotPrefixedByWs;
            return { hideDotPrefixedByWs: rest };
          }
          if (s.hideDotPrefixedByWs[wsId] === true) return s;
          return {
            hideDotPrefixedByWs: { ...s.hideDotPrefixedByWs, [wsId]: true },
          };
        }),
    }),
    {
      name: "multica_knowledge_display_prefs",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
    },
  ),
);

registerForWorkspaceRehydration(() => useDisplayPrefsStore.persist.rehydrate());
