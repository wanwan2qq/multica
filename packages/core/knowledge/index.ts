export type KnowledgeTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

export type KnowledgeTreeResponse = {
  repo_url: string;
  description: string;
  ref: string;
  browse_url: string;
  provider: "github" | "gitlab" | "gitea";
  entries: KnowledgeTreeEntry[];
};

export type KnowledgeBranchesResponse = {
  branches: string[];
  default_branch: string;
};

export type KnowledgeFileResponse = {
  path: string;
  ref: string;
  browse_url: string;
  media: "markdown" | "text" | "binary" | "html";
  truncated: boolean;
  size: number;
  content: string;
};

export {
  defaultKnowledgePath,
  isKnowledgeDescription,
  pickKnowledgeRepo,
} from "./pick-repo";
export {
  filterBrowsableKnowledgePaths,
  pathHasDotPrefixedSegment,
} from "./filter-paths";
export {
  knowledgePathAncestorDirs,
  listKnowledgeDirectoryChildren,
  normalizeKnowledgePath,
  resolveKnowledgePath,
  type KnowledgePathKind,
} from "./path-resolver";
