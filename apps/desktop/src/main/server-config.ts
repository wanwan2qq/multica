import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deriveWsUrl } from "../shared/runtime-config";
import {
  parseKnownServers,
  upsertKnownServer,
  type KnownServer,
  type KnownServersFile,
} from "../shared/server-config";

/**
 * Persistence for the desktop server switcher (fork feature). Mirrors the
 * atomic-write pattern of `updater-preferences.ts` (temp file + rename) so a
 * crash mid-write never leaves a half-written config that would break the
 * next boot's `parseRuntimeConfig`.
 *
 * Two files under `~/.multica/`:
 *   - desktop.json        — the ACTIVE config, strict schema, untouched shape.
 *   - known-servers.json  — the address book of remembered servers.
 */

export function knownServersConfigPath(): string {
  return join(app.getPath("home"), ".multica", "known-servers.json");
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf-8");
  await rename(temporaryPath, filePath);
}

/** Read the address book. Missing or corrupt file → empty list (never throws). */
export async function readKnownServers(
  path: string = knownServersConfigPath(),
): Promise<KnownServer[]> {
  try {
    return parseKnownServers(await readFile(path, "utf-8"));
  } catch {
    return [];
  }
}

function normalizeHttpUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${field} must use http or https`);
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export interface WriteServerConfigInput {
  apiUrl: string;
  appUrl: string;
  label?: string;
}

/**
 * Apply a new active server: write the strict-shape desktop.json and upsert
 * the server into the address book. Both writes are atomic; a validation or
 * IO failure throws BEFORE the caller relaunches, so the app never restarts
 * into a config it could not write. Returns the normalized server that was
 * applied.
 */
export async function writeServerConfig(
  input: WriteServerConfigInput,
  options: { configPath: string; knownPath?: string },
): Promise<KnownServer> {
  const apiUrl = normalizeHttpUrl(input.apiUrl, "apiUrl");
  const appUrl = normalizeHttpUrl(input.appUrl, "appUrl");
  const label =
    typeof input.label === "string" && input.label.trim().length > 0
      ? input.label.trim()
      : undefined;

  const activeConfig = {
    schemaVersion: 1 as const,
    apiUrl,
    wsUrl: deriveWsUrl(apiUrl),
    appUrl,
  };
  await atomicWriteJson(options.configPath, activeConfig);

  const knownPath = options.knownPath ?? knownServersConfigPath();
  const server: KnownServer = { label, apiUrl, appUrl };
  const next = upsertKnownServer(await readKnownServers(knownPath), server);
  const file: KnownServersFile = { schemaVersion: 1, servers: next };
  await atomicWriteJson(knownPath, file);

  return server;
}

/** Remove one address-book entry by apiUrl. No-op when absent. */
export async function removeKnownServer(
  apiUrl: string,
  path: string = knownServersConfigPath(),
): Promise<KnownServer[]> {
  const next = (await readKnownServers(path)).filter((s) => s.apiUrl !== apiUrl);
  const file: KnownServersFile = { schemaVersion: 1, servers: next };
  await atomicWriteJson(path, file);
  return next;
}
