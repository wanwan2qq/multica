import { queryOptions } from "@tanstack/react-query";
import { api, errorCode } from "../api";

export const knowledgeKeys = {
  all: (wsId: string) => ["workspaces", wsId, "knowledge"] as const,
  tree: (wsId: string) => [...knowledgeKeys.all(wsId), "tree"] as const,
  file: (wsId: string, path: string) => [...knowledgeKeys.all(wsId), "file", path] as const,
};

function retryUnlessUnconfigured(count: number, err: unknown): boolean {
  if (errorCode(err) === "knowledge_repo_not_configured") return false;
  return count < 2;
}

export function knowledgeTreeOptions(wsId: string) {
  return queryOptions({
    queryKey: knowledgeKeys.tree(wsId),
    queryFn: () => api.getKnowledgeTree(wsId),
    enabled: wsId.length > 0,
    retry: retryUnlessUnconfigured,
  });
}

export function knowledgeFileOptions(wsId: string, path: string) {
  return queryOptions({
    queryKey: knowledgeKeys.file(wsId, path),
    queryFn: () => api.getKnowledgeFile(wsId, path),
    enabled: wsId.length > 0 && path.length > 0,
    retry: retryUnlessUnconfigured,
  });
}
