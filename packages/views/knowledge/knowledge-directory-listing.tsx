"use client";

import {
  ChevronRight,
  File,
  FileCode,
  FileText,
  Braces,
  Folder,
  Globe,
  Image,
  Palette,
} from "lucide-react";
import { listKnowledgeDirectoryChildren } from "@multica/core/knowledge";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../i18n";

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
  ".json": "config",
  ".yaml": "config",
  ".yml": "config",
  ".png": "image",
  ".jpg": "image",
  ".css": "style",
};

const ICON_CLASS: Record<FileIconKind, string> = {
  markdown: "text-sky-500",
  html: "text-sky-500",
  code: "text-violet-500",
  config: "text-amber-500",
  image: "text-emerald-500",
  style: "text-pink-500",
  generic: "text-muted-foreground",
};

function fileIconForName(name: string) {
  const ext = name.lastIndexOf(".") >= 0 ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const kind = EXT_ICON_MAP[ext] ?? "generic";
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
}

function displayName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export function KnowledgeDirectoryListing({
  dirPath,
  filePaths,
  onSelect,
}: {
  dirPath: string;
  filePaths: string[];
  onSelect: (path: string) => void;
}) {
  const { t } = useT("knowledge");
  const { directories, files } = listKnowledgeDirectoryChildren(dirPath, filePaths);
  const itemCount = directories.length + files.length;
  const folderName = displayName(dirPath);

  return (
    <div className="mx-auto w-full max-w-[96ch] px-6 pb-24 pt-7 sm:px-8 lg:px-10">
      <div className="mb-6 flex items-start gap-3">
        <Folder className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <h2 className="truncate text-title text-foreground">{folderName}</h2>
          <p className="mt-1 text-caption text-muted-foreground">
            {itemCount === 0
              ? t(($) => $.empty.directory_empty)
              : t(($) => $.page.directory_item_count, { count: itemCount })}
          </p>
        </div>
      </div>

      {itemCount === 0 ? (
        <p className="text-caption text-muted-foreground">{t(($) => $.empty.directory_empty_hint)}</p>
      ) : (
        <ul className="divide-y divide-surface-border rounded-lg border border-surface-border">
          {directories.map((path) => (
            <li key={path}>
              <button
                type="button"
                onClick={() => onSelect(path)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 px-3 text-left text-caption transition-colors",
                  "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 truncate text-foreground">{displayName(path)}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint-foreground" />
              </button>
            </li>
          ))}
          {files.map((path) => {
            const name = displayName(path);
            const Icon = fileIconForName(name);
            const ext = name.lastIndexOf(".") >= 0 ? name.slice(name.lastIndexOf(".")) : "";
            const kind = EXT_ICON_MAP[ext.toLowerCase()] ?? "generic";
            return (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onSelect(path)}
                  className={cn(
                    "flex h-10 w-full items-center gap-3 px-3 text-left text-caption transition-colors",
                    "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", ICON_CLASS[kind])} />
                  <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
                  {ext ? (
                    <span className="shrink-0 text-micro leading-none text-faint-foreground tabular-nums">
                      {ext}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
