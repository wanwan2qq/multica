"use client";

import { useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  File,
  FileCode,
  Braces,
  Image,
  Palette,
  Globe,
  Folder,
  FolderOpen,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { Input } from "@multica/ui/components/ui/input";
import { isImeComposing } from "@multica/core/utils";
import { useT } from "../i18n";
import { useTreeExpandStore, type TreeExpandStore } from "@multica/core/knowledge/stores/tree-expand-store";

// ---------------------------------------------------------------------------
// Tree data structures
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
}

function buildTree(filePaths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of filePaths) {
    const parts = filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = { name, path, isDirectory: !isLast, children: [] };
        current.push(existing);
      }

      if (!isLast) current = existing.children;
    }
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.isDirectory) sortNodes(node.children);
    }
    return nodes;
  }

  return sortNodes(root);
}

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

type FileIconKind = "markdown" | "html" | "code" | "config" | "image" | "style" | "generic";

const EXT_ICON_MAP: Record<string, FileIconKind> = {
  ".md": "markdown",
  ".mdx": "markdown",
  ".html": "html",
  ".htm": "html",
  ".ts": "code",
  ".tsx": "code",
  ".js": "code",
  ".jsx": "code",
  ".go": "code",
  ".py": "code",
  ".rs": "code",
  ".rb": "code",
  ".java": "code",
  ".c": "code",
  ".cpp": "code",
  ".h": "code",
  ".swift": "code",
  ".kt": "code",
  ".sh": "code",
  ".bash": "code",
  ".zsh": "code",
  ".sql": "code",
  ".json": "config",
  ".yaml": "config",
  ".yml": "config",
  ".toml": "config",
  ".xml": "config",
  ".env": "config",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",
  ".ico": "image",
  ".css": "style",
  ".scss": "style",
  ".less": "style",
};

function getFileIconKind(name: string): FileIconKind {
  const ext = name.lastIndexOf(".") >= 0 ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return EXT_ICON_MAP[ext] ?? "generic";
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot);
}

// ---------------------------------------------------------------------------
// Icon colors per file kind (muted for generic, semantic for others)
// ---------------------------------------------------------------------------

const ICON_CLASS: Record<FileIconKind, string> = {
  markdown: "text-sky-500",
  html: "text-sky-500",
  code: "text-violet-500",
  config: "text-amber-500",
  image: "text-emerald-500",
  style: "text-pink-500",
  generic: "text-muted-foreground",
};

const EXT_BADGE_CLASS: Record<FileIconKind, string> = {
  markdown: "text-sky-600/70",
  html: "text-sky-600/70",
  code: "text-violet-600/70",
  config: "text-amber-600/70",
  image: "text-emerald-600/70",
  style: "text-pink-600/70",
  generic: "text-muted-foreground/60",
};

// ---------------------------------------------------------------------------
// Tree node renderer
// ---------------------------------------------------------------------------

function TreeNodeItem({
  node,
  selectedPath,
  onSelect,
  expanded,
  isExpanded,
  onToggle,
  depth = 0,
}: {
  node: TreeNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  expanded: boolean;
  isExpanded: (path: string) => boolean;
  onToggle: (path: string) => void;
  depth?: number;
}) {
  const isSelected = node.path === selectedPath;

  if (node.isDirectory) {
    const FolderIcon = expanded ? FolderOpen : Folder;
    const ChevronIcon = expanded ? ChevronDown : ChevronRight;

    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className={cn(
            "flex h-8 w-full items-center gap-1.5 rounded-md pr-2.5 text-left text-caption transition-colors",
            "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
        >
          <ChevronIcon className="h-3 w-3 shrink-0" />
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="truncate text-xs font-medium">{node.name}</span>
          {node.children.length > 0 && (
            <span className="ml-auto shrink-0 text-[10px] leading-none text-faint-foreground tabular-nums">
              {node.children.length}
            </span>
          )}
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                expanded={isExpanded(child.path)}
                isExpanded={isExpanded}
                onToggle={onToggle}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const kind = getFileIconKind(node.name);
  const ext = getFileExtension(node.name);

  const IconComponent = (() => {
    switch (kind) {
      case "markdown":
        return FileText;
      case "html":
        return Globe;
      case "code":
        return FileCode;
      case "config":
        return Braces;
      case "image":
        return Image;
      case "style":
        return Palette;
      default:
        return File;
    }
  })();

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={() => onSelect(node.path)}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md pr-2.5 text-left text-caption transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "bg-surface-selected font-medium text-surface-selected-foreground"
          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 10}px` }}
    >
      <IconComponent className={cn("h-3.5 w-3.5 shrink-0", ICON_CLASS[kind])} />
      <span className="truncate text-xs">{node.name}</span>
      {ext && (
        <span className={cn("ml-auto shrink-0 text-[10px] leading-none tabular-nums", EXT_BADGE_CLASS[kind])}>
          {ext}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

const EMPTY_ARRAY: readonly string[] = Object.freeze([]);

export function KnowledgeTree({
  wsId,
  filePaths,
  selectedPath,
  onSelect,
  filter = "",
  onFilterChange,
}: {
  wsId: string;
  filePaths: string[];
  selectedPath: string;
  onSelect: (path: string) => void;
  /** Lowercased substring matched against the full file path. */
  filter?: string;
  /** Called when the user types or clears the filter input. */
  onFilterChange?: (next: string) => void;
}) {
  const { t } = useT("knowledge");
  const normalizedFilter = filter.trim().toLowerCase();

  // When the filter is non-empty, prune the tree to only paths whose
  // descendants (or themselves) match. A returned empty list means "no
  // matches — show the empty state".
  const tree = useMemo(() => {
    const full = buildTree(filePaths);
    if (normalizedFilter.length === 0) return full;
    const pruned = pruneTree(full, normalizedFilter);
    return pruned;
  }, [filePaths, normalizedFilter]);

  // Auto-expand: every ancestor of a match becomes expanded so a hit inside
  // a collapsed directory is actually visible. Persisted expand state is
  // unioned with this set so a user who already expanded the folder stays
  // expanded when the filter is cleared.
  const expandedList = useTreeExpandStore(
    (s: TreeExpandStore) => s.expandedByWs[wsId] ?? EMPTY_ARRAY,
  );
  const searchExpanded = useMemo(() => {
    if (normalizedFilter.length === 0) return null;
    return ancestorDirsForMatches(filePaths, normalizedFilter);
  }, [filePaths, normalizedFilter]);
  const expanded = useMemo(() => {
    const base = new Set(expandedList);
    if (searchExpanded) {
      for (const dir of searchExpanded) base.add(dir);
    }
    return base;
  }, [expandedList, searchExpanded]);

  const allDirs = useMemo(() => collectAllDirs(tree), [tree]);
  const allExpanded = allDirs.size > 0 && expanded.size === allDirs.size;

  const toggle = useCallback(
    (path: string) => useTreeExpandStore.getState().toggle(wsId, path),
    [wsId],
  );

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      useTreeExpandStore.getState().collapseAll(wsId);
    } else {
      useTreeExpandStore.getState().expandAll(wsId, Array.from(allDirs));
    }
  }, [allDirs, allExpanded, wsId]);

  const isExpanded = useCallback(
    (path: string) => expanded.has(path),
    [expanded],
  );

  // Count matches across the original file list so the message reflects
  // every hit, not just those visible above the fold.
  const matchCount = useMemo(() => {
    if (normalizedFilter.length === 0) return 0;
    let n = 0;
    for (const p of filePaths) {
      if (p.toLowerCase().includes(normalizedFilter)) n++;
    }
    return n;
  }, [filePaths, normalizedFilter]);

  // Filter applied but produced no matches — render the no-match empty
  // state instead of an empty tree so the user gets explicit feedback.
  if (tree.length === 0) {
    if (normalizedFilter.length > 0) {
      return (
        <div className="flex flex-col gap-2">
          <SearchInput
            value={filter}
            onChange={(v) => onFilterChange?.(v)}
            placeholder={t(($) => $.page.search_placeholder)}
            ariaLabel={t(($) => $.page.search_aria)}
            clearLabel={t(($) => $.page.search_clear)}
          />
          <p className="px-2.5 py-6 text-caption text-muted-foreground">
            {t(($) => $.empty.no_match)}
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <FolderOpen className="h-5 w-5 text-faint-foreground" />
        <p className="mt-2 text-caption">{t(($) => $.empty.no_file_description)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5">
        <span className="text-[11px] font-medium text-faint-foreground uppercase tracking-wider">
          {t(($) => $.page.tree_title)}
        </span>
        <button
          type="button"
          onClick={toggleAll}
          disabled={normalizedFilter.length > 0}
          className={cn(
            "rounded p-0.5 text-faint-foreground hover:text-foreground transition-colors",
            normalizedFilter.length > 0 && "pointer-events-none opacity-0",
          )}
          aria-label={allExpanded ? t(($) => $.page.collapse_all) : t(($) => $.page.expand_all)}
          title={allExpanded ? t(($) => $.page.collapse_all) : t(($) => $.page.expand_all)}
        >
          {allExpanded ? (
            <ChevronsDownUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <SearchInput
        value={filter}
        onChange={(v) => onFilterChange?.(v)}
        placeholder={t(($) => $.page.search_placeholder)}
        ariaLabel={t(($) => $.page.search_aria)}
        clearLabel={t(($) => $.page.search_clear)}
      />
      {normalizedFilter.length > 0 && (
        <p className="px-2.5 pb-1.5 text-caption text-muted-foreground">
          {matchCount === 0
            ? t(($) => $.empty.no_match)
            : t(($) => $.empty.match_count, { count: matchCount })}
        </p>
      )}
      {tree.map((node) => (
        <TreeNodeItem
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expanded={isExpanded(node.path)}
          isExpanded={isExpanded}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearLabel: string;
}) {
  const hasValue = value.length > 0;

  // During IME composition (e.g. typing Chinese pinyin), every keystroke
  // fires onChange with the intermediate text. Skip these so the tree
  // doesn't re-filter mid-word; the committed value lands via
  // onCompositionEnd below.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isImeComposing(e)) return;
    onChange(e.target.value);
  };

  // Some IMEs fire compositionend with the cancelled partial value rather
  // than the cleared value. If the user already cleared the field via the
  // X button (or the value already matches), ignore the stale event.
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    const next = (e.target as HTMLInputElement).value;
    if (next === value) return;
    onChange(next);
  };

  return (
    <div className="relative px-2.5 pb-2">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={handleChange}
        onCompositionEnd={handleCompositionEnd}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 border-input/50 bg-surface-hover pl-8 pr-8 text-caption placeholder:text-faint-foreground focus-visible:border-input focus-visible:bg-background"
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function collectAllDirs(nodes: TreeNode[]): Set<string> {
  const paths = new Set<string>();
  function walk(list: TreeNode[]) {
    for (const n of list) {
      if (n.isDirectory) {
        paths.add(n.path);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return paths;
}

/**
 * For every path in `filePaths` that matches `filter`, collect every
 * ancestor directory. Returned as a set so the caller can union it with
 * the persisted expand state without worrying about duplicates.
 */
function ancestorDirsForMatches(filePaths: string[], filter: string): Set<string> {
  const dirs = new Set<string>();
  for (const p of filePaths) {
    if (!p.toLowerCase().includes(filter)) continue;
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs;
}

/**
 * Keep only nodes whose path contains the filter (for files) or that have
 * at least one surviving descendant (for directories). Directories with no
 * surviving descendants are pruned so the user only sees paths that could
 * possibly lead to a match.
 */
function pruneTree(nodes: TreeNode[], filter: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.isDirectory) {
      const kept = pruneTree(n.children, filter);
      if (kept.length > 0) {
        out.push({ ...n, children: kept });
      }
    } else if (n.path.toLowerCase().includes(filter)) {
      out.push(n);
    }
  }
  return out;
}