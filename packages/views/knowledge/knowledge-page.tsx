"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useKnowledgePathStore } from "@multica/core/knowledge/stores/knowledge-path-store";
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

  // Render-time ref guards: when the user switches branches, `activeRef`
  // flips and the new query starts, but `treeQuery.data` / `fileQuery.data`
  // still hold the *previous* ref's response until the new one lands. Treat
  // mismatched data as "not yet ready" so we render a skeleton instead of
  // stale content during the transition. (No data + error stays an error.)
  const treeIsForCurrentRef = treeQuery.data?.ref === activeRef;
  const fileIsForCurrentRef =
    fileQuery.data?.ref === activeRef && fileQuery.data?.path === pathParam;
  const hasStaleTreeData = Boolean(treeQuery.data) && !treeIsForCurrentRef;
  const hasStaleFileData = Boolean(fileQuery.data) && !fileIsForCurrentRef;
  const showTreePending = treeQuery.isPending || hasStaleTreeData;
  const showTreeError = treeQuery.isError && treeIsForCurrentRef;
  const showFilePending = fileQuery.isPending || hasStaleFileData;
  const showFileError = fileQuery.isError && fileIsForCurrentRef;
  const showInitialTreeLoad = showTreePending && !treeQuery.data;

  const files = useMemo(
    () => blobPaths(treeQuery.data?.entries ?? []),
    [treeQuery.data?.entries],
  );

  // Ephemeral UI state — only this single component sees it. Resetting it
  // across workspace/branch switches is the page's job via `key`, not the
  // input's.
  const [filter, setFilter] = useState("");

  useEffect(() => {
    // Wait for the tree response that actually corresponds to `activeRef`;
    // otherwise an in-flight refetch for the *previous* ref could land us
    // on a stale default-path redirect.
    if (pathParam.length > 0 || !treeQuery.isSuccess || !treeIsForCurrentRef) return;
    // Re-entry through the sidebar (bare `/{slug}/knowledge`) or a refresh
    // can drop `?path=`. Restore the last file the user opened when it still
    // exists on this ref; otherwise fall back to the default overview.
    const last = useKnowledgePathStore.getState().pathByWs[wsId];
    const next = last && files.includes(last) ? last : defaultKnowledgePath(files);
    if (!next) return;
    const params = new URLSearchParams(searchParams);
    params.set("path", next);
    replace(`${pathname}?${params.toString()}`);
  }, [files, pathParam, pathname, replace, searchParams, treeQuery.isSuccess, treeIsForCurrentRef, wsId]);

  const selectPath = (next: string) => {
    useKnowledgePathStore.getState().setPath(wsId, next);
    const params = new URLSearchParams(searchParams);
    params.set("path", next);
    replace(`${pathname}?${params.toString()}`);
  };

  // Switching branches can orphan the currently selected path (it might
  // not exist on the new ref). Clear ?path= before the new tree/file
  // fetches so the user isn't briefly pointed at a dead link. The
  // auto-redirect above then lands them back on the last-opened file only
  // if it still exists on the new ref, otherwise the new ref's overview.
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
    ? (fileIsForCurrentRef && fileQuery.data?.browse_url) ||
      (treeIsForCurrentRef && treeQuery.data?.browse_url) ||
      ""
    : (treeIsForCurrentRef && treeQuery.data?.browse_url) || "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CollectionPageHeader
        icon={Library}
        title={t(($) => $.page.title)}
        description={activeRef || undefined}
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

      {showInitialTreeLoad ? (
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
      ) : notConfigured && treeQuery.data === undefined ? (
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
      ) : showTreeError ? (
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
              {showTreePending ? (
                <div className="space-y-2 px-1">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-5/6" />
                  <Skeleton className="h-7 w-4/6" />
                  <Skeleton className="h-7 w-full" />
                </div>
              ) : files.length === 0 ? (
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
              ) : showFilePending ? (
                <div className="mx-auto max-w-[76ch] px-6 pt-7">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="mt-4 h-48 w-full" />
                </div>
              ) : showFileError ? (
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

function HtmlPreview({ content, title }: { content: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);

  // Expand the iframe to the document height so the full page renders in the
  // parent scroll area instead of a cramped inner viewport.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const syncHeight = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const next = Math.max(
        doc.documentElement?.scrollHeight ?? 0,
        doc.body?.scrollHeight ?? 0,
        480,
      );
      setHeight(next);
    };

    iframe.addEventListener("load", syncHeight);
    return () => iframe.removeEventListener("load", syncHeight);
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={content}
      title={title}
      className="w-full border-0 bg-background"
      style={{ height }}
    />
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
        <div className="mx-auto max-w-[76ch] px-6 pb-24 pt-7 sm:px-8">
          <RichContent content={resolvedContent} density="document" phase="settled" />
        </div>
      ) : media === "html" ? (
        <HtmlPreview content={resolvedContent} title={currentPath} />
      ) : (
        <pre className="mx-auto max-w-[80ch] overflow-x-auto px-6 py-7 font-mono text-caption leading-relaxed text-foreground">
          {resolvedContent}
        </pre>
      )}
    </div>
  );
}