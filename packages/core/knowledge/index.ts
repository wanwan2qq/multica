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
  provider: "github" | "gitea";
  entries: KnowledgeTreeEntry[];
};

export type KnowledgeFileResponse = {
  path: string;
  ref: string;
  browse_url: string;
  media: "markdown" | "text" | "binary";
  truncated: boolean;
  size: number;
  content: string;
};

export {
  defaultKnowledgePath,
  isKnowledgeDescription,
  pickKnowledgeRepo,
} from "./pick-repo";
