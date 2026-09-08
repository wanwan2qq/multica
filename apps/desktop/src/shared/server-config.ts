/**
 * Known-servers address book (fork feature, desktop-only).
 *
 * `~/.multica/desktop.json` keeps a strict schema (`parseRuntimeConfig`) as the
 * single active config, so the list of remembered servers lives in a separate
 * file — `~/.multica/known-servers.json`. Both sit under the per-user,
 * per-machine home directory, which gives the "remembered for this user on
 * this machine" scoping the feature needs with no extra keying.
 *
 * `wsUrl` is intentionally not stored: it is re-derived from `apiUrl` via
 * `deriveWsUrl` whenever a server is applied, so the address book stays a
 * minimal `{ label, apiUrl, appUrl }` record.
 */

export interface KnownServer {
  /** Optional human label (e.g. "内网", "测试"). Falls back to the host when empty. */
  label?: string;
  apiUrl: string;
  appUrl: string;
}

export interface KnownServersFile {
  schemaVersion: 1;
  servers: KnownServer[];
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseKnownServer(value: unknown): KnownServer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (!isHttpUrl(obj.apiUrl) || !isHttpUrl(obj.appUrl)) return null;
  const label =
    typeof obj.label === "string" && obj.label.trim().length > 0
      ? obj.label.trim()
      : undefined;
  return { label, apiUrl: obj.apiUrl, appUrl: obj.appUrl };
}

/**
 * Lenient parse: a corrupt file or a single bad entry must never block login,
 * so invalid entries are skipped and the whole thing degrades to an empty
 * list rather than throwing. Returns null only when the top level is unusable.
 */
export function parseKnownServers(raw: string): KnownServer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const servers = (parsed as Record<string, unknown>).servers;
  if (!Array.isArray(servers)) return [];
  const out: KnownServer[] = [];
  for (const entry of servers) {
    const server = parseKnownServer(entry);
    if (server) out.push(server);
  }
  return out;
}

/** Upsert by apiUrl: an existing entry's label/appUrl is replaced in place. */
export function upsertKnownServer(
  servers: KnownServer[],
  next: KnownServer,
): KnownServer[] {
  const index = servers.findIndex((s) => s.apiUrl === next.apiUrl);
  if (index === -1) return [...servers, next];
  const copy = servers.slice();
  copy[index] = next;
  return copy;
}
