import { describe, expect, it } from "vitest";
import { applyGate } from "../world/transitions";
import { World } from "../world/world";
import { successors } from "./problem";
import { solve } from "./solver";
import { worldKey } from "./state";

describe("successors", () => {
  it("lists only state-changing actions, in fixed order", () => {
    const list = successors(World.fromMatrix([[1, 0], [0, 0]]));
    expect(list.map((s) => [s.request.kind, s.request.row, s.request.col, s.outcome.cost])).toEqual([
      ["topDown", 0, 0, 5],
      ["sideGate", 0, 0, 1],
    ]);
    expect(list[0]!.world.toMatrix()).toEqual([[0, 0], [1, 0]]);
    expect(list[1]!.world.toMatrix()).toEqual([[0.5, 0.5], [0, 0]]);
  });

  it("returns nothing for a world without sand", () => {
    expect(successors(new World(3, 2, "A"))).toEqual([]);
  });
});

describe("solve: hand-computed cases", () => {
  it("a goal state costs 0 with no steps", () => {
    const r = solve(new World(2, 2, "A"));
    expect(r.found).toBe(true);
    expect(r.steps).toEqual([]);
    expect(r.totalCost).toBe(0);
  });

  it("1x1 full sand costs 5", () => {
    expect(solve(World.fromMatrix([[1]])).totalCost).toBe(5);
  });

  it("1x1 half sand costs 3", () => {
    expect(solve(World.fromMatrix([[0.5]])).totalCost).toBe(3);
  });

  it("2x1 [[1],[0]] costs 10", () => {
    const r = solve(World.fromMatrix([[1], [0]]));
    expect(r.totalCost).toBe(10);
    expect(r.steps).toHaveLength(2);
  });

  it("1x2 [[1,0]] costs 5 (splitting with the side gate costs 7)", () => {
    expect(solve(World.fromMatrix([[1, 0]])).totalCost).toBe(5);
  });
});

describe("solve: predefined 4x2 example", () => {
  const initial = World.predefined4x2();
  const r = solve(initial);

  it("finds a goal path no more expensive than the 50-cost manual path", () => {
    expect(r.found).toBe(true);
    expect(r.totalCost).toBeGreaterThan(0);
    expect(r.totalCost).toBeLessThanOrEqual(50);
    expect(r.steps.at(-1)!.matrix.flat().every((v) => v === 0)).toBe(true);
  });

  it("total equals the sum of step costs and running totals are cumulative", () => {
    const sum = r.steps.reduce((acc, s) => acc + s.outcome.cost, 0);
    expect(r.totalCost).toBe(sum);
    expect(r.steps.at(-1)!.runningTotal).toBe(sum);
  });

  it("replaying the solution reaches the goal state", () => {
    let world = initial;
    for (const step of r.steps) {
      const result = applyGate(world, step.request);
      expect(result.ok).toBe(true);
      if (result.ok) world = result.world;
    }
    expect(world.isGoalState()).toBe(true);
    expect(worldKey(world)).toBe(worldKey(world));
  });
});
