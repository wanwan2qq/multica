"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { copyText } from "@multica/ui/lib/clipboard";
import { useT } from "../i18n";
import { formatKnowledgeRepoPath, formatKnowledgeWikiLink } from "./knowledge-path-copy";

export function useKnowledgePathCopy() {
  const { t } = useT("knowledge");

  const copyPath = useCallback(
    async (path: string) => {
      const text = formatKnowledgeRepoPath(path);
      if (text.length === 0) return;
      if (await copyText(text)) {
        toast.success(t(($) => $.page.toast_path_copied));
      }
    },
    [t],
  );

  const copyWikiLink = useCallback(
    async (path: string) => {
      const text = formatKnowledgeWikiLink(path);
      if (text.length === 0) return;
      if (await copyText(text)) {
        toast.success(t(($) => $.page.toast_wiki_link_copied));
      }
    },
    [t],
  );

  return { copyPath, copyWikiLink };
}
