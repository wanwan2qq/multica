// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  darwinInstalledAppBundlePath,
  darwinUpdateZipPath,
  darwinUpdaterCacheDir,
} from "./updater-install-darwin";

describe("darwin post-quit install paths", () => {
  it("derives the electron-updater cache and zip location", () => {
    expect(darwinUpdaterCacheDir("/Users/me")).toBe(
      "/Users/me/Library/Caches/@multicadesktop-updater",
    );
    expect(darwinUpdateZipPath("/Users/me/nonexistent")).toBeNull();
  });

  it("derives the installed .app bundle from the executable path", () => {
    expect(
      darwinInstalledAppBundlePath(
        "/Applications/Multica.app/Contents/MacOS/Multica",
      ),
    ).toBe("/Applications/Multica.app");
  });
});
