import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { app } from "electron";

/** electron-updater cache for @multica/desktop packaged builds. */
export function darwinUpdaterCacheDir(homeDir: string): string {
  return join(homeDir, "Library", "Caches", "@multicadesktop-updater");
}

export function darwinUpdateZipPath(homeDir: string): string | null {
  const cacheDir = darwinUpdaterCacheDir(homeDir);
  const primary = join(cacheDir, "update.zip");
  if (existsSync(primary)) return primary;

  const pendingDir = join(cacheDir, "pending");
  if (!existsSync(pendingDir)) return null;

  const pendingZip = readdirSync(pendingDir)
    .filter((name) => name.endsWith(".zip"))
    .sort()
    .at(-1);
  if (!pendingZip) return null;
  return join(pendingDir, pendingZip);
}

/** Resolve the .app bundle path for the running packaged app. */
export function darwinInstalledAppBundlePath(exePath: string): string {
  // .../Multica.app/Contents/MacOS/Multica → .../Multica.app
  return join(exePath, "..", "..", "..");
}

/**
 * Squirrel/ShipIt often fails silently for adhoc-signed fork builds: the UI
 * closes but ShipIt never swaps the bundle. Schedule a post-quit ditto install
 * from electron-updater's cached update.zip, then relaunch.
 */
export function scheduleDarwinPostQuitInstall(options: {
  homeDir: string;
  exePath: string;
  pid: number;
}): boolean {
  const updateZip = darwinUpdateZipPath(options.homeDir);
  if (!updateZip) return false;

  const appBundle = darwinInstalledAppBundlePath(options.exePath);
  if (!appBundle.endsWith(".app")) return false;

  const appName = basename(appBundle);
  const scriptDir = mkdtempSync(join(tmpdir(), "multica-update-"));
  const scriptPath = join(scriptDir, "install.sh");
  const script = `#!/bin/bash
set -euo pipefail
PID="$1"
ZIP="$2"
APP="$3"
APP_NAME="$4"
while kill -0 "$PID" 2>/dev/null; do sleep 0.2; done
STAGING=$(mktemp -d)
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT
ditto -x -k "$ZIP" "$STAGING"
ditto "$STAGING/$APP_NAME" "$APP"
open "$APP"
`;
  writeFileSync(scriptPath, script, "utf8");
  chmodSync(scriptPath, 0o755);

  const child = spawn(
    scriptPath,
    [String(options.pid), updateZip, appBundle, appName],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
  return true;
}

export function tryScheduleDarwinPostQuitInstallFromApp(): boolean {
  if (process.platform !== "darwin" || !app.isPackaged) return false;
  return scheduleDarwinPostQuitInstall({
    homeDir: app.getPath("home"),
    exePath: app.getPath("exe"),
    pid: process.pid,
  });
}
