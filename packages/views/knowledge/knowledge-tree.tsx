"use client";

import { useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  File,
  FileCode,
  Braces,
  Image,
  Palette,
  Folder,
  FolderOpen,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../i18n";

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

type FileIconKind = "markdown" | "code" | "config" | "image" | "style" | "generic";

const EXT_ICON_MAP: Record<string, FileIconKind> = {
  ".md": "markdown",
  ".mdx": "markdown",
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
  code: "text-violet-500",
  config: "text-amber-500",
  image: "text-emerald-500",
  style: "text-pink-500",
  generic: "text-muted-foreground",
};

const EXT_BADGE_CLASS: Record<FileIconKind, string> = {
  markdown: "text-sky-600/70",
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

export function KnowledgeTree({
  filePaths,
  selectedPath,
  onSelect,
}: {
  filePaths: string[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const { t } = useT("knowledge");
  const tree = buildTree(filePaths);

  // Start with all directories expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const paths = new Set<string>();
    function collect(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.isDirectory) {
          paths.add(n.path);
          collect(n.children);
        }
      }
    }
    collect(tree);
    return paths;
  });

  const allExpanded = expanded.size === collectAllDirs(tree).size;

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const all = collectAllDirs(tree);
    if (expanded.size === all.size) {
      setExpanded(new Set());
    } else {
      setExpanded(all);
    }
  }, [expanded, tree]);

  const isExpanded = useCallback(
    (path: string) => expanded.has(path),
    [expanded],
  );

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <FolderOpen className="h-5 w-5 text-faint-foreground" />
        <p className="mt-2 text-caption">{t(($) => $.empty.no_file_description)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2.5 pb-1.5">
        <span className="text-[11px] font-medium text-faint-foreground uppercase tracking-wider">
          {t(($) => $.page.tree_title)}
        </span>
        <button
          type="button"
          onClick={toggleAll}
          className="rounded p-0.5 text-faint-foreground hover:text-foreground transition-colors"
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