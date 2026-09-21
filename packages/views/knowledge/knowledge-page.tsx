"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { AlertCircle, ChevronRight, Copy, Download, ExternalLink, FileQuestion, Library, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorCode } from "@multica/core/api";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  isEditableShortcutTarget,
  isPortalLayerShortcutTarget,
} from "@multica/core/shortcuts";
import {
  defaultKnowledgePath,
  filterBrowsableKnowledgePaths,
  knowledgePathAncestorDirs,
  pathHasDotPrefixedSegment,
  resolveKnowledgePath,
  type KnowledgeTreeEntry,
} from "@multica/core/knowledge";
import {
  knowledgeBranchesOptions,
  knowledgeFileOptions,
  knowledgeKeys,
  knowledgeTreeOptions,
} from "@multica/core/knowledge/queries";
import { useDisplayPrefsStore } from "@multica/core/knowledge/stores/display-prefs-store";
import { useRefStore } from "@multica/core/knowledge/stores/ref-store";
import { useKnowledgePathStore } from "@multica/core/knowledge/stores/knowledge-path-store";
import { useTreeExpandStore } from "@multica/core/knowledge/stores/tree-expand-store";
import { useWorkspacePaths } from "@multica/core/paths";
import { Button } from "@multica/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@multica/ui/components/ui/resizable";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { useSidebarSafe } from "@multica/ui/components/ui/sidebar";
import { cn } from "@multica/ui/lib/utils";
import { AppLink, useNavigation } from "../navigation";
import { useRestoredScrollEntry } from "../platform";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { shouldIgnoreGlobalShortcutEvent } from "../layout/global-shortcuts";
import { RichContent } from "../rich-content";
import { useT } from "../i18n";
import { BranchPicker } from "./branch-picker";
import { KnowledgeDirectoryListing } from "./knowledge-directory-listing";
import { KnowledgeBrowsePrefs, KnowledgeTree } from "./knowledge-tree";
import { readingWidthClass } from "./reading-width";
import { resolveKnowledgeLinks } from "./resolve-links";
import { useKnowledgeFileDownload } from "./use-knowledge-file-download";
import { useKnowledgePathCopy } from "./use-knowledge-path-copy";

function blobPaths(entries: KnowledgeTreeEntry[]): string[] {
  return entries.filter((entry) => entry.type === "blob").map((entry) => entry.path);
}

export function KnowledgePage() {
  const { t } = useT("knowledge");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const queryClient = useQueryClient();
  const { pathname, searchParams, replace, push } = useNavigation();
  const pathParam = searchParams.get("path") ?? "";
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "multica_knowledge_layout",
  });

  // Full-screen reading mode: the document takes the whole window — the KB
  // tree and the shell's nav column both go away. Page-level view state, so
  // it is deliberately not persisted: a reader who leaves the tab comes back
  // to the page as every other route shows it.
  const [fullscreen, setFullscreen] = useState(false);

  // The nav column belongs to the shell, and a page cannot hide a sibling.
  // Ask through the sidebar context instead of reaching into the shell.
  // `useSidebarSafe` returns null when there is no shell around the page — a
  // standalone render — which leaves the toggle a change to the reader alone.
  const sidebar = useSidebarSafe();
  // `setOpen`'s identity changes with `open` (see SidebarProvider), so the
  // effect below reads the context through a ref rather than resubscribing on
  // every nav toggle — the same reason the provider's own auto-collapse does.
  const sidebarRef = useRef(sidebar);
  useEffect(() => {
    sidebarRef.current = sidebar;
  });
  useEffect(() => {
    if (!fullscreen) return;
    // Park the nav state the reader came in with and close the column. On
    // exit — or unmount, which is a tab switch or a route change — put back
    // exactly what was there, so full screen never costs the user their nav.
    const { open, setOpen } = sidebarRef.current ?? {};
    setOpen?.(false);
    return () => {
      if (open) setOpen?.(true);
    };
  }, [fullscreen]);

  // Escape is the way out, unless something above the page owns the key: an
  // open menu or dialog, an editable target, or a handler that already
  // consumed it. Composed from the shell's own guards so that the popup closes
  // first and the reader does not swallow the second Escape as well.
  useEffect(() => {
    if (!fullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (shouldIgnoreGlobalShortcutEvent(event)) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (isPortalLayerShortcutTarget(event.target)) return;
      setFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen]);

  // Branch selection: persisted per-workspace in localStorage; empty means
  // "fall back to whatever the server's default-branch endpoint returns".
  // The branch picker always re-keys off this value so the server response
  // can also refresh the picker after the page mounts.
  const refFromStore = useRefStore((s) => s.refByWs[wsId] ?? "");
  const hideDotPrefixed = useDisplayPrefsStore(
    (s) => s.hideDotPrefixedByWs[wsId] ?? false,
  );
  const setHideDotPrefixed = useDisplayPrefsStore((s) => s.setHideDotPrefixed);
  const branchesQuery = useQuery(knowledgeBranchesOptions(wsId));
  const defaultBranch = branchesQuery.data?.default_branch ?? "";
  const activeRef = refFromStore || defaultBranch;

  const treeQuery = useQuery(knowledgeTreeOptions(wsId, activeRef));

  // Render-time ref guards: when the user switches branches, `activeRef`
  // flips and the new query starts, but `treeQuery.data` / `fileQuery.data`
  // still hold the *previous* ref's response until the new one lands. Treat
  // mismatched data as "not yet ready" so we render a skeleton instead of
  // stale content during the transition. (No data + error stays an error.)
  const treeIsForCurrentRef = treeQuery.data?.ref === activeRef;
  const hasStaleTreeData = Boolean(treeQuery.data) && !treeIsForCurrentRef;
  const showTreePending = treeQuery.isPending || hasStaleTreeData;
  const showTreeError = treeQuery.isError && treeIsForCurrentRef;
  const showInitialTreeLoad = showTreePending && !treeQuery.data;

  const allFiles = useMemo(
    () => blobPaths(treeQuery.data?.entries ?? []),
    [treeQuery.data?.entries],
  );

  const visibleFiles = useMemo(
    () => filterBrowsableKnowledgePaths(allFiles, hideDotPrefixed),
    [allFiles, hideDotPrefixed],
  );

  const resolvedPath = useMemo(() => {
    if (pathParam.length === 0 || !treeIsForCurrentRef || allFiles.length === 0) return null;
    return resolveKnowledgePath(pathParam, allFiles);
  }, [pathParam, allFiles, treeIsForCurrentRef]);

  const listingFiles = useMemo(() => {
    if (
      hideDotPrefixed &&
      resolvedPath?.kind === "directory" &&
      pathHasDotPrefixedSegment(resolvedPath.path)
    ) {
      return allFiles;
    }
    return visibleFiles;
  }, [allFiles, hideDotPrefixed, resolvedPath, visibleFiles]);

  const fileQuery = useQuery(
    knowledgeFileOptions(wsId, activeRef, pathParam, {
      enabled: resolvedPath?.kind === "file",
    }),
  );

  const fileIsForCurrentRef =
    resolvedPath?.kind === "file" &&
    fileQuery.data?.ref === activeRef &&
    fileQuery.data?.path === pathParam;
  const hasStaleFileData = Boolean(fileQuery.data) && !fileIsForCurrentRef;
  const showFilePending = resolvedPath?.kind === "file" && (fileQuery.isPending || hasStaleFileData);
  const showFileError = resolvedPath?.kind === "file" && fileQuery.isError && fileIsForCurrentRef;

  // Manual refresh: Git remotes move under the same branch name, but React
  // Query keeps the last tree/file payload until something invalidates it.
  // Desktop stays focused for long sessions, so window-focus refetch alone
  // is not enough — expose an explicit control next to the branch picker.
  const isRefreshing =
    branchesQuery.isFetching || treeQuery.isFetching || fileQuery.isFetching;
  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: knowledgeKeys.all(wsId) });
  }, [queryClient, wsId]);

  // Ephemeral UI state — only this single component sees it. Resetting it
  // across workspace/branch switches is the page's job via `key`, not the
  // input's.
  const [filter, setFilter] = useState("");

  const { download, busy: downloadingFile } = useKnowledgeFileDownload(wsId);

  // KB-HOOK: restore the reader's scroll position on return. The content pane
  // scrolls inside its own `overflow-y-auto` section, which the browser's
  // history restoration never reaches, so the shared MUL-4741 scroll
  // restoration protocol handles capture: the pane is marked
  // `data-tab-scroll-root` and both the web capture listener and the desktop
  // tab coordinator record its offset. The container key carries the document
  // path because the desktop memento is keyed by pathname only (no `?path=`),
  // so without it one document's offset would leak onto another.
  //
  // Restoration is applied AFTER the document renders, not at ref-attach: the
  // file loads async, so at attach time the pane still holds a one-screen
  // skeleton and a saved offset beyond its scrollHeight clamps back to 0. We
  // wait for `fileContentReady`, then assign the offset into the laid-out
  // document.
  const scrollContainerKey = `knowledge-content:${pathParam}`;
  const contentScrollRef = useRef<HTMLElement | null>(null);
  const restoredScrollEntry = useRestoredScrollEntry(scrollContainerKey);
  const fileContentReady =
    resolvedPath?.kind === "file" &&
    !showFilePending &&
    !showFileError &&
    fileIsForCurrentRef;
  useEffect(() => {
    if (!fileContentReady) return;
    const el = contentScrollRef.current;
    const top = restoredScrollEntry?.top ?? 0;
    if (!el || top <= 0) return;
    // Retry across frames: markdown images/code blocks/Mermaid grow the
    // document after first paint, so a single assignment can be clamped to a
    // smaller offset before the content reaches full height. Re-apply each
    // frame until the offset sticks or we run out of frames (mirrors the
    // convergence loop issue-detail uses for late-growing content).
    let rafId = 0;
    let frames = 0;
    const apply = () => {
      el.scrollTop = top;
      const stuck = Math.abs(el.scrollTop - top) <= 1;
      if (!stuck && ++frames < 60) {
        rafId = requestAnimationFrame(apply);
        return;
      }
    };
    rafId = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(rafId);
  }, [fileContentReady, scrollContainerKey, restoredScrollEntry]);

  // Toggling full screen swaps the reader between the panel group and a bare
  // section, so the scroll container is a new element and would start at the
  // top — losing the reader's place in the middle of a long document. Carry
  // the offset across in a layout effect, which lands before paint: the
  // document never visibly jumps.
  const pendingScrollTopRef = useRef<number | null>(null);
  const toggleFullscreen = useCallback(() => {
    pendingScrollTopRef.current = contentScrollRef.current?.scrollTop ?? null;
    setFullscreen((value) => !value);
  }, []);
  useLayoutEffect(() => {
    const pending = pendingScrollTopRef.current;
    if (pending === null) return;
    pendingScrollTopRef.current = null;
    const el = contentScrollRef.current;
    if (el && pending > 0) el.scrollTop = pending;
  }, [fullscreen]);

  useEffect(() => {
    // Wait for the tree response that actually corresponds to `activeRef`;
    // otherwise an in-flight refetch for the *previous* ref could land us
    // on a stale default-path redirect.
    if (pathParam.length > 0 || !treeQuery.isSuccess || !treeIsForCurrentRef) return;
    // Re-entry through the sidebar (bare `/{slug}/knowledge`) or a refresh
    // can drop `?path=`. Restore the last file the user opened when it still
    // exists on this ref; otherwise fall back to the default overview.
    const last = useKnowledgePathStore.getState().pathByWs[wsId];
    const lastResolved = last ? resolveKnowledgePath(last, allFiles) : null;
    const next =
      lastResolved && lastResolved.kind !== "missing"
        ? last
        : defaultKnowledgePath(visibleFiles);
    if (!next) return;
    const params = new URLSearchParams(searchParams);
    params.set("path", next);
    replace(`${pathname}?${params.toString()}`);
  }, [allFiles, pathParam, pathname, replace, searchParams, treeQuery.isSuccess, treeIsForCurrentRef, visibleFiles, wsId]);

  useEffect(() => {
    if (!resolvedPath || resolvedPath.kind === "missing" || !treeIsForCurrentRef) return;
    const ancestors = knowledgePathAncestorDirs(resolvedPath.path);
    if (ancestors.length === 0) return;
    const store = useTreeExpandStore.getState();
    const current = store.expandedByWs[wsId] ?? [];
    const merged = [...new Set([...current, ...ancestors])];
    if (merged.length !== current.length) {
      store.expandAll(wsId, merged);
    }
  }, [resolvedPath, treeIsForCurrentRef, wsId]);

  const selectPath = (next: string) => {
    useKnowledgePathStore.getState().setPath(wsId, next);
    const params = new URLSearchParams(searchParams);
    params.set("path", next);
    // Push so linked-doc browsing supports back/forward; branch changes and
    // bare /knowledge re-entry still use replace below.
    push(`${pathname}?${params.toString()}`);
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

  // The file bar is the reader's chrome — the path, and the file's own
  // actions — so it sits above the scroll container rather than inside it: a
  // long document scrolls under the bar instead of carrying it away. Keeping
  // it out also means the reader below it is sized by layout instead of by
  // measurement, which matters for the HTML frame: the bar only appears once
  // the file resolves, so a height measured before that would be stale by
  // exactly the bar's height the moment it shows up.
  const fileIsReady =
    Boolean(pathParam) &&
    resolvedPath?.kind === "file" &&
    !showFilePending &&
    !showFileError;
  const fileBar =
    pathParam && (resolvedPath?.kind === "directory" || fileIsReady) ? (
      <KnowledgeBreadcrumb
        currentPath={pathParam}
        onSelectPath={selectPath}
        // Omitted for a directory: folders are Git's to archive, not this
        // page's, and the preview endpoint has no folder payload to save.
        onDownload={fileIsReady ? () => void download(pathParam, activeRef) : undefined}
        downloading={fileIsReady && downloadingFile}
      />
    ) : null;

  // The reader in both modes: full screen swaps the tree out around it, but
  // the scroller — and therefore the element the scroll offset is restored
  // into — is the same.
  const contentSection = (
    <div className="flex h-full min-h-0 flex-col">
      {fileBar}
      <section
        ref={contentScrollRef}
        data-tab-scroll-root={scrollContainerKey}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      >
        {!pathParam ? (
          <CollectionPageState
            icon={FileQuestion}
            title={t(($) => $.empty.no_file_title)}
            description={t(($) => $.empty.no_file_description)}
          />
        ) : !resolvedPath && pathParam.length > 0 ? (
          <div className={cn(readingWidthClass(fullscreen), "px-6 pt-7 sm:px-8 lg:px-10")}>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-4 h-48 w-full" />
          </div>
        ) : resolvedPath?.kind === "missing" ? (
          <CollectionPageState
            icon={FileQuestion}
            title={t(($) => $.empty.path_not_found_title)}
            description={t(($) => $.empty.path_not_found_description)}
          />
        ) : resolvedPath?.kind === "directory" ? (
          <KnowledgeDirectoryListing
            dirPath={resolvedPath.path}
            filePaths={listingFiles}
            onSelect={selectPath}
            fullscreen={fullscreen}
          />
        ) : showFilePending ? (
          <div className={cn(readingWidthClass(fullscreen), "px-6 pt-7 sm:px-8 lg:px-10")}>
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
          // `activeRef` is what the file query was keyed on, and this branch
          // only renders once that response has landed — so it names the
          // revision actually on screen.
          <KnowledgeFileBody
            currentPath={pathParam}
            media={fileQuery.data?.media ?? "text"}
            content={fileQuery.data?.content ?? ""}
            truncated={fileQuery.data?.truncated === true}
            browseURL={fileQuery.data?.browse_url ?? browseURL}
            fullscreen={fullscreen}
          />
        )}
      </section>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CollectionPageHeader
        icon={Library}
        title={t(($) => $.page.title)}
        description={activeRef || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={t(($) =>
                fullscreen ? $.page.fullscreen_exit : $.page.fullscreen_enter,
              )}
              title={t(($) =>
                fullscreen ? $.page.fullscreen_exit : $.page.fullscreen_enter,
              )}
              aria-pressed={fullscreen}
              onClick={toggleFullscreen}
            >
              {fullscreen ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </Button>
            <BranchPicker
              wsId={wsId}
              value={refFromStore}
              onChange={handleBranchChange}
              disabled={!treeQuery.isSuccess && !branchesQuery.isSuccess}
            />
            <Button
              variant="outline"
              size="sm"
              aria-label={t(($) => $.page.refresh_aria)}
              title={t(($) => $.page.refresh)}
              onClick={handleRefresh}
              disabled={isRefreshing || notConfigured}
            >
              <RefreshCw className={isRefreshing ? "size-3.5 animate-spin" : "size-3.5"} />
              <span className="hidden sm:inline">{t(($) => $.page.refresh)}</span>
            </Button>
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
      ) : fullscreen ? (
        // Full-screen reading: the tree is unmounted rather than collapsed so
        // no drag handle is left behind for a document that has nothing to
        // resize against. `toggleFullscreen` carries the scroll offset across
        // the remount of the scroll container.
        contentSection
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
              ) : visibleFiles.length === 0 ? (
                <div className="flex flex-col gap-2">
                  <KnowledgeBrowsePrefs
                    hideDotPrefixed={hideDotPrefixed}
                    onHideDotPrefixedChange={(hide) => setHideDotPrefixed(wsId, hide)}
                  />
                  <p className="px-2.5 py-2 text-caption text-muted-foreground">
                    {allFiles.length > 0 && hideDotPrefixed
                      ? t(($) => $.empty.all_dot_hidden_description)
                      : t(($) => $.empty.no_file_description)}
                  </p>
                </div>
              ) : (
                <KnowledgeTree
                  key={`${wsId}:${activeRef}`}
                  wsId={wsId}
                  filePaths={visibleFiles}
                  selectedPath={pathParam}
                  onSelect={selectPath}
                  filter={filter}
                  onFilterChange={setFilter}
                  hideDotPrefixed={hideDotPrefixed}
                  onHideDotPrefixedChange={(hide) => setHideDotPrefixed(wsId, hide)}
                />
              )}
            </aside>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="content" minSize="40%">
            {contentSection}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

function KnowledgeBreadcrumb({
  currentPath,
  onSelectPath,
  onDownload,
  downloading = false,
}: {
  currentPath: string;
  onSelectPath: (path: string) => void;
  // Omitted when the selection is a directory: folders are Git's to archive,
  // not this page's, and the preview endpoint has no folder payload to save.
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const { t } = useT("knowledge");
  const { copyPath, copyWikiLink } = useKnowledgePathCopy();
  const segments = currentPath.split("/");

  return (
    <nav
      aria-label={t(($) => $.page.breadcrumb_aria)}
      className="flex shrink-0 items-center gap-2 border-b border-surface-border px-4 py-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
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
      </div>
      {onDownload ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-muted-foreground"
          aria-label={t(($) => $.page.download_aria)}
          title={t(($) => $.page.download)}
          onClick={onDownload}
          disabled={downloading}
        >
          <Download className={downloading ? "size-3.5 animate-pulse" : "size-3.5"} />
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-muted-foreground"
              aria-label={t(($) => $.page.copy_path_aria)}
              title={t(($) => $.page.copy_path)}
            >
              <Copy className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => void copyPath(currentPath)}>
            <Copy className="size-3.5" />
            {t(($) => $.page.copy_path)}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyWikiLink(currentPath)}>
            {t(($) => $.page.copy_wiki_link)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

function HtmlPreview({ content, title }: { content: string; title: string }) {
  // An HTML document gets the reader's pane as its window, the way a browser
  // tab does — nothing about it is measured from the document's own content.
  // These documents are written against the viewport: `height: 100vh` slide
  // decks, `position: fixed` chrome, images sized in `vh`. Sized to its
  // content instead, the page is laid out against a viewport it cannot see —
  // a deck puts its pager wherever the measurement landed, and everything the
  // document paints stops short of the pane, leaving a band of background
  // below it. Layout does the sizing: the frame is the scroller's only child,
  // below the file bar, so it stays right through a full-screen toggle, a
  // dragged divider, and the window itself. A document taller than the pane
  // scrolls inside the frame, as it would in a tab.
  return (
    <iframe
      srcDoc={content}
      title={title}
      className="h-full w-full border-0 bg-background"
    />
  );
}

function KnowledgeFileBody({
  currentPath,
  media,
  content,
  truncated,
  browseURL,
  fullscreen = false,
}: {
  currentPath: string;
  media: string;
  content: string;
  truncated: boolean;
  browseURL: string;
  /** Widen for the full-screen reader (see `readingWidthClass`). */
  fullscreen?: boolean;
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
        <div className={cn(readingWidthClass(fullscreen), "px-6 pb-24 pt-7 sm:px-8 lg:px-10")}>
          <RichContent content={resolvedContent} density="document" phase="settled" />
        </div>
      ) : media === "html" ? (
        <HtmlPreview content={resolvedContent} title={currentPath} />
      ) : (
        <pre
          className={cn(
            readingWidthClass(fullscreen),
            "overflow-x-auto px-6 py-7 font-mono text-caption leading-relaxed text-foreground sm:px-8 lg:px-10",
          )}
        >
          {resolvedContent}
        </pre>
      )}
    </div>
  );
}