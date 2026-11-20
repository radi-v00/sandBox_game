import { describe, expect, it } from "vitest";
import { SHELF_ANIMATION_MS } from "../shelves/shelf";
import { ShelfManager } from "../shelves/shelfManager";
import { World } from "../world/world";
import { GameSession } from "./session";

function openShelves(world: World, boxes: [number, number][], gaps: [number, number][]) {
  const m = new ShelfManager(world.rows, world.cols);
  boxes.forEach(([r, c]) => m.pull("horizontal", r, c));
  gaps.forEach(([r, c]) => m.pull("vertical", r, c));
  m.update(SHELF_ANIMATION_MS);
  return m;
}

describe("GameSession", () => {
  it("rejects a gate operation while its shelf is not open, and charges nothing", () => {
    const s = new GameSession(World.predefined4x2());
    const m = new ShelfManager(4, 2);
    const r = s.apply({ kind: "topDown", row: 0, col: 0 }, m);
    expect(r.ok).toBe(false);
    expect(s.totalCost).toBe(0);
    expect(s.history).toHaveLength(0);
  });

  it("accumulates cost and stores s and s' in the history", () => {
    const s = new GameSession(World.predefined4x2());
    const m = openShelves(s.world, [[0, 0], [1, 1]], [[1, 0]]);
    expect(s.apply({ kind: "topDown", row: 0, col: 0 }, m).ok).toBe(true); // 5
    expect(s.apply({ kind: "sideGate", row: 1, col: 0 }, m).ok).toBe(true); // 1 (target full, nothing moves)
    expect(s.apply({ kind: "topDown", row: 1, col: 1 }, m).ok).toBe(true); // 1 + 4*(1+1) = 9
    expect(s.totalCost).toBe(15);
    expect(s.history.map((h) => h.cost)).toEqual([5, 1, 9]);
    expect(s.history.map((h) => h.runningTotal)).toEqual([5, 6, 15]);
    expect(s.history[0]).toMatchObject({ sBefore: 1, sAfter: 0 });
    expect(s.history[1]?.sAfter).toBeNull();
  });

  it("reset restores the initial world and clears the history", () => {
    const s = new GameSession(World.predefined4x2());
    const m = openShelves(s.world, [[0, 0]], []);
    s.apply({ kind: "topDown", row: 0, col: 0 }, m);
    s.reset();
    expect(s.totalCost).toBe(0);
    expect(s.history).toHaveLength(0);
    expect(s.world.toMatrix()).toEqual([[1, 0], [0, 1], [0, 1], [1, 0]]);
  });
});
