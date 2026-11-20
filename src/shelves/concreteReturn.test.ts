import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { checkReturn } from "./returnPolicy";
import { SHELF_ANIMATION_MS } from "./shelf";
import { ShelfManager } from "./shelfManager";

describe("concrete never blocks a shelf return", () => {
  it("concrete in the preceding box does not block a horizontal shelf", () => {
    const w = World.fromKinds([["concrete", "concrete"], ["empty", "empty"]], "B");
    expect(checkReturn("horizontal", 1, 0, "returnWhenClear", w).allowed).toBe(true);
    expect(checkReturn("horizontal", 1, 1, "returnWhenClear", w).allowed).toBe(true);
  });

  it("sand or water in the preceding box still blocks", () => {
    expect(checkReturn("horizontal", 1, 0, "returnWhenClear", World.fromKinds([["fullSand"], ["empty"]], "B")).allowed).toBe(false);
    expect(checkReturn("horizontal", 1, 0, "returnWhenClear", World.fromKinds([["fullWater"], ["empty"]], "B")).allowed).toBe(false);
  });

  it("vertical shelves always return regardless of contents", () => {
    const w = World.fromKinds([["fullSand", "fullWater"]], "B");
    expect(checkReturn("vertical", 0, 0, "returnWhenClear", w).allowed).toBe(true);
    const m = new ShelfManager(1, 2);
    m.pull("vertical", 0, 0);
    m.update(SHELF_ANIMATION_MS);
    expect(m.requestReturn("vertical", 0, 0, w).ok).toBe(true);
  });

  it("a horizontal shelf blocked only by concrete returns normally", () => {
    const w = World.fromKinds([["concrete"], ["empty"]], "B");
    const m = new ShelfManager(2, 1, { horizontal: "returnWhenClear", vertical: "returnWhenClear" });
    m.pull("horizontal", 1, 0);
    m.update(SHELF_ANIMATION_MS);
    expect(m.requestReturn("horizontal", 1, 0, w).ok).toBe(true);
    m.update(SHELF_ANIMATION_MS);
    expect(m.shelf("horizontal", 1, 0).phase).toBe("closed");
  });
});
