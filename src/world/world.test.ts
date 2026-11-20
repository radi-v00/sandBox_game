import { describe, expect, it } from "vitest";
import { allowedKinds } from "./box";
import { World } from "./world";

describe("Mode A box states", () => {
  it("accepts empty, half sand and full sand", () => {
    const w = new World(1, 3, "A");
    w.setBox(0, 0, "empty");
    w.setBox(0, 1, "halfSand");
    w.setBox(0, 2, "fullSand");
    expect(w.toMatrix()).toEqual([[0, 0.5, 1]]);
  });

  it("rejects water and concrete", () => {
    const w = new World(2, 2, "A");
    expect(() => w.setBox(0, 0, "fullWater")).toThrow();
    expect(() => w.setBox(0, 0, "concrete")).toThrow();
  });

  it("rejects out-of-bounds access", () => {
    const w = new World(2, 2, "A");
    expect(() => w.getBox(2, 0)).toThrow();
    expect(() => w.setBox(0, -1, "empty")).toThrow();
  });
});

describe("random generation", () => {
  it("only produces the three Mode A states", () => {
    const w = World.random(20, 20, "A", 42, { empty: 1, halfSand: 1, fullSand: 1 });
    const allowed = allowedKinds("A");
    for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) expect(allowed).toContain(w.getBox(r, c));
  });

  it("is reproducible for the same seed", () => {
    const p = { empty: 1, halfSand: 1, fullSand: 1 };
    expect(World.random(6, 6, "A", 7, p).toMatrix()).toEqual(World.random(6, 6, "A", 7, p).toMatrix());
  });

  it("respects zero probabilities", () => {
    const w = World.random(5, 5, "A", 3, { empty: 0, halfSand: 0, fullSand: 1 });
    expect(w.toMatrix().flat().every((v) => v === 1)).toBe(true);
  });

  it("rejects invalid probabilities", () => {
    expect(() => World.random(2, 2, "A", 1, { empty: 0, halfSand: 0, fullSand: 0 })).toThrow();
    expect(() => World.random(2, 2, "A", 1, { empty: -1, halfSand: 1, fullSand: 1 })).toThrow();
  });
});

describe("predefined 4x2 example", () => {
  it("loads exactly", () => {
    const w = World.predefined4x2();
    expect(w.rows).toBe(4);
    expect(w.cols).toBe(2);
    expect(w.mode).toBe("A");
    expect(w.toMatrix()).toEqual([
      [1, 0],
      [0, 1],
      [0, 1],
      [1, 0],
    ]);
  });
});

describe("goal detection", () => {
  it("is reached when all boxes are empty", () => {
    expect(new World(3, 2, "A").isGoalState()).toBe(true);
  });

  it("is not reached when any box has sand", () => {
    const w = new World(3, 2, "A");
    w.setBox(2, 1, "halfSand");
    expect(w.isGoalState()).toBe(false);
    expect(World.predefined4x2().isGoalState()).toBe(false);
  });

  it("clone is independent", () => {
    const a = new World(2, 2, "A");
    const b = a.clone();
    b.setBox(0, 0, "fullSand");
    expect(a.getBox(0, 0)).toBe("empty");
  });
});
