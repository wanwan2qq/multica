"use client";

import { useEffect, useMemo } from "react";
import { AlertCircle, ExternalLink, FileQuestion, Library } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { errorCode } from "@multica/core/api";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  defaultKnowledgePath,
  type KnowledgeTreeEntry,
} from "@multica/core/knowledge";
import {
  knowledgeFileOptions,
  knowledgeTreeOptions,
} from "@multica/core/knowledge/queries";
import { useWorkspacePaths } from "@multica/core/paths";
import { Button } from "@multica/ui/components/ui/button";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { AppLink, useNavigation } from "../navigation";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { RichContent } from "../rich-content";
import { FileTree } from "../skills/components/file-tree";
import { useT } from "../i18n";

function blobPaths(entries: KnowledgeTreeEntry[]): string[] {
  return entries.filter((entry) => entry.type === "blob").map((entry) => entry.path);
}

export function KnowledgePage() {
  const { t } = useT("knowledge");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { pathname, searchParams, replace } = useNavigation();
  const pathParam = searchParams.get("path") ?? "";

  const treeQuery = useQuery(knowledgeTreeOptions(wsId));
  const fileQuery = useQuery(knowledgeFileOptions(wsId, pathParam));

  const files = useMemo(
    () => blobPaths(treeQuery.data?.entries ?? []),
    [treeQuery.data?.entries],
  );

  useEffect(() => {
    if (pathParam.length > 0 || !treeQuery.isSuccess) return;
    const next = defaultKnowledgePath(files);
    if (!next) return;
    const params = new URLSearchParams(searchParams);
    params.set("path", next);
    replace(`${pathname}?${params.toString()}`);
  }, [files, pathParam, pathname, replace, searchParams, treeQuery.isSuccess]);

  const selectPath = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("path", next);
    replace(`${pathname}?${params.toString()}`);
  };

  const notConfigured = errorCode(treeQuery.error) === "knowledge_repo_not_configured";
  const reposHref = `${p.settings()}?tab=repositories`;
  const browseURL = pathParam
    ? (fileQuery.data?.browse_url || treeQuery.data?.browse_url || "")
    : (treeQuery.data?.browse_url || "");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CollectionPageHeader
        icon={Library}
        title={t(($) => $.page.title)}
        description={treeQuery.data?.ref ? treeQuery.data.ref : undefined}
        actions={
          browseURL ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={browseURL} target="_blank" rel="noopener noreferrer" />
              }
              nativeButton={false}
            >
              <ExternalLink className="size-3.5" />
              {t(($) => $.page.open_in_git)}
            </Button>
          ) : null
        }
      />

      {treeQuery.isPending ? (
        <div className="flex min-h-0 flex-1 md:flex-row">
          <div className="space-y-2 border-b border-surface-border p-4 md:w-64 md:border-b-0 md:border-r">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex-1 p-6">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="mt-4 h-40 w-full" />
          </div>
        </div>
      ) : notConfigured ? (
        <CollectionPageState
          icon={Library}
          title={t(($) => $.empty.not_configured_title)}
          description={t(($) => $.empty.not_configured_description)}
          actions={
            <Button
              size="sm"
              render={<AppLink href={reposHref} />}
              nativeButton={false}
            >
              {t(($) => $.empty.open_repositories)}
            </Button>
          }
        />
      ) : treeQuery.isError ? (
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.empty.load_error_title)}
          description={
            treeQuery.error instanceof Error
              ? treeQuery.error.message
              : t(($) => $.empty.load_error_fallback)
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside
            className="shrink-0 border-b border-surface-border p-3 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r md:p-4"
            aria-label={t(($) => $.page.tree_aria)}
          >
            {files.length === 0 ? (
              <p className="px-2.5 py-2 text-caption text-muted-foreground">
                {t(($) => $.empty.no_file_description)}
              </p>
            ) : (
              <FileTree
                filePaths={files}
                selectedPath={pathParam}
                onSelect={selectPath}
              />
            )}
          </aside>
          <section className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {!pathParam ? (
              <CollectionPageState
                icon={FileQuestion}
                title={t(($) => $.empty.no_file_title)}
                description={t(($) => $.empty.no_file_description)}
              />
            ) : fileQuery.isPending ? (
              <div className="mx-auto max-w-[68ch] px-6 pt-7">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="mt-4 h-48 w-full" />
              </div>
            ) : fileQuery.isError ? (
              <CollectionPageState
                role="alert"
                tone="destructive"
                icon={AlertCircle}
                title={t(($) => $.empty.load_error_title)}
                description={
                  fileQuery.error instanceof Error
                    ? fileQuery.error.message
                    : t(($) => $.empty.load_error_fallback)
                }
              />
            ) : (
              <KnowledgeFileBody
                media={fileQuery.data?.media ?? "text"}
                content={fileQuery.data?.content ?? ""}
                truncated={fileQuery.data?.truncated === true}
                browseURL={fileQuery.data?.browse_url ?? browseURL}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function KnowledgeFileBody({
  media,
  content,
  truncated,
  browseURL,
}: {
  media: string;
  content: string;
  truncated: boolean;
  browseURL: string;
}) {
  const { t } = useT("knowledge");

  if (media === "binary") {
    return (
      <CollectionPageState
        icon={FileQuestion}
        title={t(($) => $.empty.binary_title)}
        description={t(($) => $.empty.binary_description)}
        actions={
          browseURL ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={browseURL} target="_blank" rel="noopener noreferrer" />
              }
              nativeButton={false}
            >
              <ExternalLink className="size-3.5" />
              {t(($) => $.page.open_in_git)}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="h-full">
      {truncated ? (
        <p className="border-b border-surface-border px-6 py-2 text-caption text-muted-foreground">
          {t(($) => $.page.truncated)}
        </p>
      ) : null}
      {media === "markdown" ? (
        <div className="mx-auto max-w-[68ch] px-6 pb-24 pt-7 sm:px-8">
          <RichContent content={content} density="document" phase="settled" />
        </div>
      ) : (
        <pre className="mx-auto max-w-[80ch] overflow-x-auto px-6 py-7 font-mono text-caption leading-relaxed text-foreground">
          {content}
        </pre>
      )}
    </div>
  );
}
