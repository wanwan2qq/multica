"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { AlertCircle, ChevronRight, ExternalLink, FileQuestion, Library } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { errorCode } from "@multica/core/api";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  defaultKnowledgePath,
  type KnowledgeTreeEntry,
} from "@multica/core/knowledge";
import {
  knowledgeBranchesOptions,
  knowledgeFileOptions,
  knowledgeTreeOptions,
} from "@multica/core/knowledge/queries";
import { useRefStore } from "@multica/core/knowledge/stores/ref-store";
import { useWorkspacePaths } from "@multica/core/paths";
import { Button } from "@multica/ui/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@multica/ui/components/ui/resizable";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { AppLink, useNavigation } from "../navigation";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { RichContent } from "../rich-content";
import { useT } from "../i18n";
import { BranchPicker } from "./branch-picker";
import { KnowledgeTree } from "./knowledge-tree";
import { resolveKnowledgeLinks } from "./resolve-links";

function blobPaths(entries: KnowledgeTreeEntry[]): string[] {
  return entries.filter((entry) => entry.type === "blob").map((entry) => entry.path);
}

export function KnowledgePage() {
  const { t } = useT("knowledge");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { pathname, searchParams, replace } = useNavigation();
  const pathParam = searchParams.get("path") ?? "";
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "multica_knowledge_layout",
  });

  // Branch selection: persisted per-workspace in localStorage; empty means
  // "fall back to whatever the server's default-branch endpoint returns".
  // The branch picker always re-keys off this value so the server response
  // can also refresh the picker after the page mounts.
  const refFromStore = useRefStore((s) => s.refByWs[wsId] ?? "");
  const branchesQuery = useQuery(knowledgeBranchesOptions(wsId));
  const defaultBranch = branchesQuery.data?.default_branch ?? "";
  const activeRef = refFromStore || defaultBranch;

  const treeQuery = useQuery(knowledgeTreeOptions(wsId, activeRef));
  const fileQuery = useQuery(knowledgeFileOptions(wsId, activeRef, pathParam));

  const files = useMemo(
    () => blobPaths(treeQuery.data?.entries ?? []),
    [treeQuery.data?.entries],
  );

  // Ephemeral UI state — only this single component sees it. Resetting it
  // across workspace/branch switches is the page's job via `key`, not the
  // input's.
  const [filter, setFilter] = useState("");

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

  // Switching branches can orphan the currently selected path (it might
  // not exist on the new ref). Clear ?path= before the new tree/file
  // fetches so the user isn't briefly pointed at a dead link, and let
  // the auto-redirect above land them on the new ref's overview.
  const handleBranchChange = useCallback(
    (next: string) => {
      useRefStore.getState().setRef(wsId, next);
      if (pathParam.length > 0) {
        const params = new URLSearchParams(searchParams);
        params.delete("path");
        replace(`${pathname}?${params.toString()}`);
      }
    },
    [wsId, pathname, searchParams, replace, pathParam],
  );

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
          <div className="flex items-center gap-2">
            <BranchPicker
              wsId={wsId}
              value={refFromStore}
              onChange={handleBranchChange}
              disabled={!treeQuery.isSuccess && !branchesQuery.isSuccess}
            />
            {browseURL ? (
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
            ) : null}
          </div>
        }
      />

      {treeQuery.isPending ? (
        <div className="flex min-h-0 flex-1 md:flex-row">
          <div className="space-y-2 border-b border-surface-border p-4 md:w-72 md:border-b-0 md:border-r">
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
        <ResizablePanelGroup
          orientation="horizontal"
          className="flex-1 min-h-0"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <ResizablePanel
            id="tree"
            defaultSize={288}
            minSize={200}
            maxSize={480}
            groupResizeBehavior="preserve-pixel-size"
          >
            <aside
              className="h-full overflow-y-auto border-r border-surface-border p-3 md:p-4"
              aria-label={t(($) => $.page.tree_aria)}
            >
              {files.length === 0 ? (
                <p className="px-2.5 py-2 text-caption text-muted-foreground">
                  {t(($) => $.empty.no_file_description)}
                </p>
              ) : (
                <KnowledgeTree
                  key={`${wsId}:${activeRef}`}
                  wsId={wsId}
                  filePaths={files}
                  selectedPath={pathParam}
                  onSelect={selectPath}
                  filter={filter}
                  onFilterChange={setFilter}
                />
              )}
            </aside>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="content" minSize="40%">
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
                <>
                  <KnowledgeBreadcrumb
                    currentPath={pathParam}
                    onSelectPath={selectPath}
                  />
                  <KnowledgeFileBody
                    currentPath={pathParam}
                    media={fileQuery.data?.media ?? "text"}
                    content={fileQuery.data?.content ?? ""}
                    truncated={fileQuery.data?.truncated === true}
                    browseURL={fileQuery.data?.browse_url ?? browseURL}
                  />
                </>
              )}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

function KnowledgeBreadcrumb({
  currentPath,
  onSelectPath,
}: {
  currentPath: string;
  onSelectPath: (path: string) => void;
}) {
  const { t } = useT("knowledge");
  const segments = currentPath.split("/");

  return (
    <nav
      aria-label={t(($) => $.page.breadcrumb_aria)}
      className="flex items-center gap-0.5 border-b border-surface-border px-4 py-2 overflow-x-auto"
    >
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        const path = segments.slice(0, i + 1).join("/");
        return (
          <Fragment key={path}>
            {i > 0 && (
              <ChevronRight className="h-3 w-3 shrink-0 text-faint-foreground" />
            )}
            {isLast ? (
              <span className="truncate text-caption font-medium text-foreground">
                {segment}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSelectPath(path)}
                className="truncate text-caption text-muted-foreground hover:text-foreground transition-colors rounded px-1 -mx-1"
              >
                {segment}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

function KnowledgeFileBody({
  currentPath,
  media,
  content,
  truncated,
  browseURL,
}: {
  currentPath: string;
  media: string;
  content: string;
  truncated: boolean;
  browseURL: string;
}) {
  const { t } = useT("knowledge");

  // Resolve relative links in markdown to knowledge-page URLs
  const resolvedContent = useMemo(
    () => (media === "markdown" ? resolveKnowledgeLinks(content, currentPath) : content),
    [media, content, currentPath],
  );

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
          <RichContent content={resolvedContent} density="document" phase="settled" />
        </div>
      ) : media === "html" ? (
        <div className="flex h-full min-h-0 flex-col">
          <iframe
            srcDoc={resolvedContent}
            sandbox="allow-popups"
            title={currentPath}
            className="min-h-[60vh] w-full flex-1 border-0 bg-background"
          />
          <p className="border-t border-surface-border px-6 py-2 text-caption text-muted-foreground">
            {t(($) => $.empty.html_sandbox_notice)}
          </p>
        </div>
      ) : (
        <pre className="mx-auto max-w-[80ch] overflow-x-auto px-6 py-7 font-mono text-caption leading-relaxed text-foreground">
          {resolvedContent}
        </pre>
      )}
    </div>
  );
}