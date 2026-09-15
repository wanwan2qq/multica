"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@multica/core/api";
import { useT } from "../i18n";
import { knowledgeDownloadFilename, saveBlobAsFile } from "./download-file";

export interface KnowledgeFileDownload {
  /** Fetch and save one file, staging it through the authenticated client. */
  download: (filePath: string, ref: string) => Promise<void>;
  /** True while a fetch is in flight, so the trigger can show progress. */
  busy: boolean;
}

// There is no optimistic path here: the file only exists once the Git host has
// answered, so the button reports progress rather than predicting the outcome.
export function useKnowledgeFileDownload(wsId: string): KnowledgeFileDownload {
  const { t } = useT("knowledge");
  const [busy, setBusy] = useState(false);

  const download = useCallback(
    async (filePath: string, ref: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const blob = await api.downloadKnowledgeFile(wsId, filePath, ref);
        saveBlobAsFile(blob, knowledgeDownloadFilename(filePath));
      } catch {
        toast.error(t(($) => $.page.download_failed));
      } finally {
        setBusy(false);
      }
    },
    [busy, t, wsId],
  );

  return { download, busy };
}
