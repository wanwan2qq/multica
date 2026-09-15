// The browser save filename for a knowledge path: its last segment. The Git
// tree is the only place the name lives (the download endpoint is addressed by
// path, not by name), so it is derived here rather than read off the response.
export function knowledgeDownloadFilename(filePath: string): string {
  const trimmed = filePath.replace(/\/+$/, "");
  const name = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  return name || "download";
}

// Hands an already-fetched Blob to the browser's download pipeline.
//
// The knowledge API is credential-gated, so the bytes have to be fetched by
// the authenticated API client first — a bare `<a href>` navigation to the
// endpoint would carry no bearer token. That makes this a Blob download on
// both platforms: web and the Electron renderer both run Chromium, and
// Electron's `will-download` handler (apps/desktop/src/main/index.ts) turns it
// into a native save dialog named by the anchor below.
export function saveBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next macrotask rather than inline: the click only *starts*
  // the download, and some browsers resolve the object URL while handling it.
  // Revoking first would cancel the save.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
