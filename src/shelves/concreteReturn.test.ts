import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { checkReturn } from "./returnPolicy";
import { SHELF_ANIMATION_MS } from "./shelf";
import { ShelfManager } from "./shelfManager";

describe("concrete never blocks a shelf return", () => {
  it("concrete in the preceding row does not block a horizontal shelf", () => {
    const w = World.fromKinds([["concrete", "concrete"], ["empty", "empty"]], "B");
    expect(checkReturn("horizontal", 1, "returnWhenClear", w).allowed).toBe(true);
  });

  it("concrete in the preceding column does not block a vertical shelf", () => {
    const w = World.fromKinds([["concrete"], ["empty"]], "B");
    expect(checkReturn("vertical", 1, "returnWhenClear", w).allowed).toBe(true);
  });

  it("sand or water in the preceding row still blocks", () => {
    expect(checkReturn("horizontal", 1, "returnWhenClear", World.fromKinds([["fullSand"], ["empty"]], "B")).allowed).toBe(
      false,
    );
    expect(
      checkReturn("horizontal", 1, "returnWhenClear", World.fromKinds([["fullWater"], ["empty"]], "B")).allowed,
    ).toBe(false);
  });

  it("a shelf blocked only by concrete returns normally", () => {
    const w = World.fromKinds([["concrete"], ["empty"]], "B");
    const m = new ShelfManager(2, 1, { horizontal: "returnWhenClear", vertical: "returnWhenClear" });
    m.pull("horizontal", 1);
    m.update(SHELF_ANIMATION_MS);
    expect(m.requestReturn("horizontal", 1, w).ok).toBe(true);
    m.update(SHELF_ANIMATION_MS);
    expect(m.shelf("horizontal", 1).phase).toBe("closed");
  });
});
