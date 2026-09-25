// @vitest-environment node

import { describe, expect, it } from "vitest";
import { raiseReserveTier } from "./view-bar";

describe("raiseReserveTier", () => {
  it("grows from the menu reserve to more, then to the promoted tab", () => {
    expect(raiseReserveTier("menu", false, 2)).toBe("more");
    expect(raiseReserveTier("more", true, 2)).toBe("promoted");
  });

  it("does not shrink when a wider reserve makes the overflow disappear", () => {
    expect(raiseReserveTier("more", false, 0)).toBe("more");
    expect(raiseReserveTier("promoted", false, 0)).toBe("promoted");
    expect(raiseReserveTier("promoted", false, 3)).toBe("promoted");
  });
});
