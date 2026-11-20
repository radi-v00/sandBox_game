import { describe, expect, it } from "vitest";
import { SHELF_ANIMATION_MS } from "../shelves/shelf";
import { ShelfManager } from "../shelves/shelfManager";
import { World } from "../world/world";
import { GameSession } from "./session";

function openBox(world: World, row: number, col: number) {
  const m = new ShelfManager(world.rows, world.cols);
  m.pull("horizontal", row, col);
  m.update(SHELF_ANIMATION_MS);
  return m;
}

describe("board editing", () => {
  it("painting is free and clears the history", () => {
    const session = new GameSession(World.predefined4x2());
    const shelves = openBox(session.world, 0, 0);
    expect(session.apply({ kind: "topDown", row: 0, col: 0 }, shelves).ok).toBe(true);
    expect(session.totalCost).toBe(5);

    session.paint(0, 0, "halfSand");
    expect(session.world.getBox(0, 0)).toBe("halfSand");
    expect(session.totalCost).toBe(0);
    expect(session.history).toHaveLength(0);
  });

  it("the painted board becomes the reset baseline", () => {
    const session = new GameSession(World.predefined4x2());
    session.paint(0, 0, "empty");
    session.paint(3, 1, "fullSand");
    session.reset();
    expect(session.world.getBox(0, 0)).toBe("empty");
    expect(session.world.getBox(3, 1)).toBe("fullSand");
  });

  it("rejects a brush that the mode does not allow", () => {
    const session = new GameSession(World.predefined4x2()); // Mode A
    expect(() => session.paint(0, 0, "fullWater")).toThrow();
  });

  it("replaceWorld resets the baseline and the progress", () => {
    const session = new GameSession(World.predefined4x2());
    session.replaceWorld(World.fromKinds([["fullWater", "concrete"], ["empty", "empty"]], "B"));
    expect(session.world.toKinds()).toEqual([["fullWater", "concrete"], ["empty", "empty"]]);
    expect(session.totalCost).toBe(0);
    session.reset();
    expect(session.world.toKinds()).toEqual([["fullWater", "concrete"], ["empty", "empty"]]);
  });
});
