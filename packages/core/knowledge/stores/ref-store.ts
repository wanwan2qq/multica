import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../../platform/workspace-storage";
import { defaultStorage } from "../../platform/storage";

/**
 * Per-user × per-workspace branch selection for the knowledge base. Empty
 * string means "no override — use the server's resolved default branch".
 * Persisted so a user lands on the same branch across reloads / workspace
 * re-entries; switching workspaces leaves every other workspace's choice
 * untouched.
 */
export interface RefStore {
  refByWs: Record<string, string>;
  setRef: (wsId: string, ref: string) => void;
  resetRef: (wsId: string) => void;
}

export const useRefStore = create<RefStore>()(
  persist(
    (set) => ({
      refByWs: {},
      setRef: (wsId, ref) =>
        set((s) => {
          const trimmed = ref.trim();
          if (trimmed === "") {
            if (!(wsId in s.refByWs)) return s;
            const { [wsId]: _, ...rest } = s.refByWs;
            return { refByWs: rest };
          }
          return { refByWs: { ...s.refByWs, [wsId]: trimmed } };
        }),
      resetRef: (wsId) =>
        set((s) => {
          if (!(wsId in s.refByWs)) return s;
          const { [wsId]: _, ...rest } = s.refByWs;
          return { refByWs: rest };
        }),
    }),
    {
      name: "multica_knowledge_ref",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
    },
  ),
);

registerForWorkspaceRehydration(() => useRefStore.persist.rehydrate());