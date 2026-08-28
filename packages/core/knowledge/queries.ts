import { queryOptions } from "@tanstack/react-query";
import { api, errorCode } from "../api";

export const knowledgeKeys = {
  all: (wsId: string) => ["workspaces", wsId, "knowledge"] as const,
  branches: (wsId: string) => [...knowledgeKeys.all(wsId), "branches"] as const,
  tree: (wsId: string, ref: string) => [...knowledgeKeys.all(wsId), "tree", ref] as const,
  file: (wsId: string, ref: string, path: string) =>
    [...knowledgeKeys.all(wsId), "file", ref, path] as const,
};

function retryUnlessUnconfigured(count: number, err: unknown): boolean {
  if (errorCode(err) === "knowledge_repo_not_configured") return false;
  return count < 2;
}

export function knowledgeBranchesOptions(wsId: string) {
  return queryOptions({
    queryKey: knowledgeKeys.branches(wsId),
    queryFn: () => api.getKnowledgeBranches(wsId),
    enabled: wsId.length > 0,
    // Branch lists change rarely; keep a short cache so the picker feels
    // snappy. Manual Refresh on the knowledge page invalidates this key.
    staleTime: 60 * 1000,
    retry: retryUnlessUnconfigured,
  });
}

export function knowledgeTreeOptions(wsId: string, ref: string) {
  return queryOptions({
    queryKey: knowledgeKeys.tree(wsId, ref),
    queryFn: () => api.getKnowledgeTree(wsId, ref),
    enabled: wsId.length > 0,
    retry: retryUnlessUnconfigured,
  });
}

export function knowledgeFileOptions(wsId: string, ref: string, path: string) {
  return queryOptions({
    queryKey: knowledgeKeys.file(wsId, ref, path),
    queryFn: () => api.getKnowledgeFile(wsId, path, ref),
    enabled: wsId.length > 0 && path.length > 0,
    retry: retryUnlessUnconfigured,
  });
}