import { describe, expect, it } from "vitest";
import { SHELF_ANIMATION_MS } from "../shelves/shelf";
import { ShelfManager } from "../shelves/shelfManager";
import { World } from "../world/world";
import { GameSession } from "./session";

const openShelves = (m: ShelfManager) => {
  for (const s of m.horizontal) s.startPull();
  for (const s of m.vertical) s.startPull();
  m.update(SHELF_ANIMATION_MS);
};

describe("settle: cascade through open shelves", () => {
  it("drains a single box to the container when its shelf is open", () => {
    const s = new GameSession(World.fromMatrix([[1]]));
    const m = new ShelfManager(1, 1);
    openShelves(m);
    const moves = s.settle(m);
    expect(moves.length).toBe(1);
    expect(s.world.getBox(0, 0)).toBe("empty");
  });

  it("cascades from row 0 to the container when both shelves are open", () => {
    const s = new GameSession(World.fromMatrix([[1], [0]]));
    const m = new ShelfManager(2, 1);
    openShelves(m);
    s.settle(m);
    // Both rows are empty: row 0 -> row 1 -> container.
    expect(s.world.getBox(0, 0)).toBe("empty");
    expect(s.world.getBox(1, 0)).toBe("empty");
  });

  it("stops at the first closed shelf below", () => {
    // Row 0 shelf open, row 1 shelf open, row 2 shelf closed.
    const s = new GameSession(World.fromMatrix([[1], [0], [0]]));
    const m = new ShelfManager(3, 1);
    // Open only rows 0 and 1.
    m.pull("horizontal", 0, 0);
    m.pull("horizontal", 1, 0);
    m.update(SHELF_ANIMATION_MS);
    s.settle(m);
    // Sand ends in row 2 (row 0 -> row 1 -> row 2 stops at closed shelf).
    expect(s.world.getBox(0, 0)).toBe("empty");
    expect(s.world.getBox(1, 0)).toBe("empty");
    expect(s.world.getBox(2, 0)).toBe("fullSand");
  });

  it("does not move when the box above the pulled shelf is empty", () => {
    // Row 0 empty, row 1 fullSand. Pull only row 0's (empty) shelf.
    // Row 1's shelf is closed, so the sand at row 1 does not move.
    const s = new GameSession(World.fromMatrix([[0], [1]]));
    const m = new ShelfManager(2, 1);
    m.pull("horizontal", 0, 0);
    m.update(SHELF_ANIMATION_MS);
    const moves = s.settle(m);
    expect(moves.length).toBe(0);
    expect(s.world.getBox(1, 0)).toBe("fullSand");
  });

  it("charges a concrete penalty when a cascade forms concrete", () => {
    // Row 0: sand. Row 1: water. Both shelves open.
    // Top-down iteration processes row 0 first, so the sand falls onto the water
    // before the water can drain. Result: concrete at row 1.
    const s = new GameSession(World.fromKinds([["fullSand"], ["fullWater"]], "B"));
    const m = new ShelfManager(2, 1);
    openShelves(m);
    s.settle(m);
    expect(s.world.getBox(1, 0)).toBe("concrete");
    expect(s.concreteBoxes.size).toBe(1);
    expect(s.penaltyTotal).toBe(10);
  });

  it("does not charge action cost for cascade moves", () => {
    const s = new GameSession(World.fromMatrix([[1], [0], [0]]));
    const m = new ShelfManager(3, 1);
    openShelves(m);
    s.settle(m);
    expect(s.actionCostTotal).toBe(0);
    expect(s.penaltyTotal).toBe(0);
  });
});

describe("settle: interaction with session.apply", () => {
  it("cascades after a pull that already moved one step", () => {
    // Row 1 and row 2 shelves: row 1 open, row 2 closed.
    // Pull row 0's shelf: sand drops to row 1. Settle cascades to row 2.
    const s = new GameSession(World.fromMatrix([[1], [0], [0]]));
    const m = new ShelfManager(3, 1);
    m.pull("horizontal", 1, 0);
    m.update(SHELF_ANIMATION_MS);

    m.pull("horizontal", 0, 0);
    m.update(SHELF_ANIMATION_MS);
    const result = s.apply({ kind: "topDown", row: 0, col: 0 }, m);
    expect(result.ok).toBe(true);
    expect(s.world.getBox(1, 0)).toBe("fullSand"); // row 0 -> row 1 (one level)

    const moves = s.settle(m);
    expect(moves.length).toBe(1);
    expect(s.world.getBox(1, 0)).toBe("empty"); // row 1 -> row 2
    expect(s.world.getBox(2, 0)).toBe("fullSand");
  });
});
