// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "../shared/runtime-config";
import {
  readKnownServers,
  removeKnownServer,
  writeServerConfig,
} from "./server-config";

let dir: string;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function makePaths() {
  dir = await mkdtemp(join(tmpdir(), "multica-server-config-"));
  return {
    configPath: join(dir, "desktop.json"),
    knownPath: join(dir, "known-servers.json"),
  };
}

describe("writeServerConfig", () => {
  it("writes a desktop.json that parseRuntimeConfig accepts", async () => {
    const { configPath, knownPath } = await makePaths();
    await writeServerConfig(
      { apiUrl: "http://10.15.42.27:8082", appUrl: "http://10.15.42.27:3002" },
      { configPath, knownPath },
    );

    const parsed = parseRuntimeConfig(await readFile(configPath, "utf-8"));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.apiUrl).toBe("http://10.15.42.27:8082");
    expect(parsed.appUrl).toBe("http://10.15.42.27:3002");
    expect(parsed.wsUrl).toBe("ws://10.15.42.27:8082/ws");
  });

  it("upserts the server into the address book", async () => {
    const { configPath, knownPath } = await makePaths();
    await writeServerConfig(
      { apiUrl: "http://a.example.com", appUrl: "http://a.example.com", label: "A" },
      { configPath, knownPath },
    );
    await writeServerConfig(
      { apiUrl: "http://b.example.com", appUrl: "http://b.example.com" },
      { configPath, knownPath },
    );

    const servers = await readKnownServers(knownPath);
    expect(servers).toHaveLength(2);
    expect(servers.map((s) => s.apiUrl)).toEqual([
      "http://a.example.com",
      "http://b.example.com",
    ]);
  });

  it("replaces an existing entry with the same apiUrl", async () => {
    const { configPath, knownPath } = await makePaths();
    await writeServerConfig(
      { apiUrl: "http://a.example.com", appUrl: "http://a.example.com", label: "old" },
      { configPath, knownPath },
    );
    await writeServerConfig(
      { apiUrl: "http://a.example.com", appUrl: "http://a.example.com:9000", label: "new" },
      { configPath, knownPath },
    );

    const servers = await readKnownServers(knownPath);
    expect(servers).toHaveLength(1);
    expect(servers[0].label).toBe("new");
    expect(servers[0].appUrl).toBe("http://a.example.com:9000");
  });

  it("normalizes trailing slashes", async () => {
    const { configPath, knownPath } = await makePaths();
    await writeServerConfig(
      { apiUrl: "http://a.example.com/", appUrl: "http://a.example.com/" },
      { configPath, knownPath },
    );
    const parsed = parseRuntimeConfig(await readFile(configPath, "utf-8"));
    expect(parsed.apiUrl).toBe("http://a.example.com");
    expect(parsed.appUrl).toBe("http://a.example.com");
  });

  it("rejects a non-http apiUrl before writing anything", async () => {
    const { configPath, knownPath } = await makePaths();
    await expect(
      writeServerConfig(
        { apiUrl: "ftp://a.example.com", appUrl: "http://a.example.com" },
        { configPath, knownPath },
      ),
    ).rejects.toThrow(/http or https/);

    // Neither file should exist after a validation failure.
    await expect(readFile(configPath, "utf-8")).rejects.toThrow();
    expect(await readKnownServers(knownPath)).toEqual([]);
  });
});

describe("readKnownServers", () => {
  it("returns [] when the file is missing", async () => {
    const { knownPath } = await makePaths();
    expect(await readKnownServers(knownPath)).toEqual([]);
  });

  it("returns [] and skips bad entries on corrupt JSON", async () => {
    const { knownPath } = await makePaths();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(knownPath, "{ not json", "utf-8");
    expect(await readKnownServers(knownPath)).toEqual([]);
  });
});

describe("removeKnownServer", () => {
  it("removes the matching apiUrl and keeps the rest", async () => {
    const { configPath, knownPath } = await makePaths();
    await writeServerConfig(
      { apiUrl: "http://a.example.com", appUrl: "http://a.example.com" },
      { configPath, knownPath },
    );
    await writeServerConfig(
      { apiUrl: "http://b.example.com", appUrl: "http://b.example.com" },
      { configPath, knownPath },
    );

    const next = await removeKnownServer("http://a.example.com", knownPath);
    expect(next.map((s) => s.apiUrl)).toEqual(["http://b.example.com"]);
    expect((await readKnownServers(knownPath)).map((s) => s.apiUrl)).toEqual([
      "http://b.example.com",
    ]);
  });
});
