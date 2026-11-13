import { queryOptions } from "@tanstack/react-query";
import { api, errorCode } from "../api";

export const knowledgeKeys = {
  all: (wsId: string) => ["workspaces", wsId, "knowledge"] as const,
  sources: (wsId: string) => [...knowledgeKeys.all(wsId), "sources"] as const,
  branches: (wsId: string, repoUrl: string) =>
    [...knowledgeKeys.all(wsId), "branches", repoUrl] as const,
  tree: (wsId: string, repoUrl: string, ref: string) =>
    [...knowledgeKeys.all(wsId), "tree", repoUrl, ref] as const,
  file: (wsId: string, repoUrl: string, ref: string, path: string) =>
    [...knowledgeKeys.all(wsId), "file", repoUrl, ref, path] as const,
};

function retryUnlessUnconfigured(count: number, err: unknown): boolean {
  const code = errorCode(err);
  if (code === "knowledge_repo_not_configured" || code === "knowledge_repo_unknown") return false;
  return count < 2;
}

export function knowledgeSourcesOptions(wsId: string) {
  return queryOptions({
    queryKey: knowledgeKeys.sources(wsId),
    queryFn: () => api.getKnowledgeSources(wsId),
    enabled: wsId.length > 0,
    staleTime: 60 * 1000,
    retry: retryUnlessUnconfigured,
  });
}

export function knowledgeBranchesOptions(wsId: string, repoUrl: string) {
  return queryOptions({
    queryKey: knowledgeKeys.branches(wsId, repoUrl),
    queryFn: () => api.getKnowledgeBranches(wsId, repoUrl),
    enabled: wsId.length > 0 && repoUrl.length > 0,
    // Branch lists change rarely; keep a short cache so the picker feels
    // snappy. Manual Refresh on the knowledge page invalidates this key.
    staleTime: 60 * 1000,
    retry: retryUnlessUnconfigured,
  });
}

export function knowledgeTreeOptions(wsId: string, repoUrl: string, ref: string) {
  return queryOptions({
    queryKey: knowledgeKeys.tree(wsId, repoUrl, ref),
    queryFn: () => api.getKnowledgeTree(wsId, ref, repoUrl),
    enabled: wsId.length > 0 && repoUrl.length > 0,
    retry: retryUnlessUnconfigured,
  });
}

export function knowledgeFileOptions(
  wsId: string,
  repoUrl: string,
  ref: string,
  path: string,
  opts?: { enabled?: boolean },
) {
  return queryOptions({
    queryKey: knowledgeKeys.file(wsId, repoUrl, ref, path),
    queryFn: () => api.getKnowledgeFile(wsId, path, ref, repoUrl),
    enabled: wsId.length > 0 && repoUrl.length > 0 && path.length > 0 && (opts?.enabled ?? true),
    retry: retryUnlessUnconfigured,
  });
}