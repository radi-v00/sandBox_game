import { describe, expect, it } from "vitest";
import { GameSession } from "../game/session";
import { solve } from "../planning/solver";
import { SHELF_ANIMATION_MS } from "../shelves/shelf";
import { ShelfManager } from "../shelves/shelfManager";
import { allowedKinds, type BoxKind } from "./box";
import { applyGate, type GateRequest } from "./transitions";
import { concreteCount } from "./stats";
import { World } from "./world";

const B = (kinds: BoxKind[][]) => World.fromKinds(kinds, "B");
const run = (world: World, req: GateRequest) => {
  const r = applyGate(world, req);
  if (!r.ok) throw new Error(r.reason);
  return r;
};
const A00: GateRequest = { kind: "topDown", row: 0, col: 0 };

describe("Mode B world", () => {
  it("rejects water and concrete in Mode A", () => {
    expect(() => World.fromKinds([["fullWater"]], "A")).toThrow();
    expect(() => World.random(3, 3, "A", 1, { empty: 1, halfSand: 0, fullSand: 0, fullWater: 1 })).toThrow();
  });

  it("random generation never creates concrete and does create water", () => {
    const w = World.random(20, 20, "B", 5, { empty: 1, halfSand: 1, fullSand: 1, fullWater: 1 });
    const kinds = w.toKinds().flat();
    expect(kinds).not.toContain("concrete");
    expect(kinds).toContain("fullWater");
    kinds.forEach((k) => expect(allowedKinds("B")).toContain(k));
  });

  it("toKinds and fromKinds round-trip", () => {
    const grid: BoxKind[][] = [["fullWater", "concrete"], ["halfSand", "empty"]];
    expect(B(grid).toKinds()).toEqual(grid);
  });
});

describe("goal state in Mode B", () => {
  it("allows water and concrete", () => {
    expect(B([["fullWater", "concrete"], ["empty", "empty"]]).isGoalState()).toBe(true);
  });
  it("does not allow sand", () => {
    expect(B([["fullWater", "concrete"], ["halfSand", "empty"]]).isGoalState()).toBe(false);
  });
});

describe("Mode B transitions", () => {
  it("sand onto water makes concrete, cost 5 + penalty 10", () => {
    const r = run(B([["fullSand"], ["fullWater"]]), A00);
    expect(r.world.toKinds()).toEqual([["empty"], ["concrete"]]);
    expect(r.outcome).toMatchObject({ sBefore: 1, sAfter: 0, cost: 5, concretePenalty: 10 });
    expect(r.outcome.newConcrete).toEqual([{ row: 1, col: 0 }]);
  });

  it("water onto sand makes concrete", () => {
    const r = run(B([["fullWater"], ["halfSand"]]), A00);
    expect(r.world.toKinds()).toEqual([["empty"], ["concrete"]]);
    expect(r.outcome.concretePenalty).toBe(10);
  });

  it("water moves into an empty box and leaves through the container without penalty", () => {
    const down = run(B([["fullWater"], ["empty"]]), A00);
    expect(down.world.toKinds()).toEqual([["empty"], ["fullWater"]]);
    expect(down.outcome.concretePenalty).toBe(0);
    const out = run(B([["fullWater"]]), A00);
    expect(out.world.toKinds()).toEqual([["empty"]]);
    expect(out.outcome.removed).toBe(1);
    expect(out.outcome.cost).toBe(5);
  });

  it("water onto water does not move: s=1, s'=1, cost 9", () => {
    const r = run(B([["fullWater"], ["fullWater"]]), A00);
    expect(r.world.toKinds()).toEqual([["fullWater"], ["fullWater"]]);
    expect(r.outcome.cost).toBe(9);
    expect(r.outcome.concretePenalty).toBe(0);
  });

  it("concrete cannot be flushed and nothing enters it", () => {
    expect(applyGate(B([["concrete"], ["empty"]]), A00).ok).toBe(false);
    const r = run(B([["fullSand"], ["concrete"]]), A00);
    expect(r.outcome.moved).toBe(0);
    expect(r.outcome.concretePenalty).toBe(0);
    expect(r.world.toKinds()).toEqual([["fullSand"], ["concrete"]]);
  });

  it("side gate: half of a full sand box forms concrete on contact with water", () => {
    const r = run(B([["fullSand", "fullWater"]]), { kind: "sideGate", row: 0, col: 0 });
    expect(r.world.toKinds()).toEqual([["halfSand", "concrete"]]);
    expect(r.outcome).toMatchObject({ cost: 1, concretePenalty: 10 });
  });

  it("side gate never moves water", () => {
    const r = run(B([["fullWater", "empty"]]), { kind: "sideGate", row: 0, col: 0 });
    expect(r.outcome.moved).toBe(0);
    expect(r.world.toKinds()).toEqual([["fullWater", "empty"]]);
  });

  it("Mode A behaviour is unchanged and never forms concrete", () => {
    const r = run(World.predefined4x2(), A00);
    expect(r.outcome).toMatchObject({ cost: 5, concretePenalty: 0 });
    expect(r.outcome.newConcrete).toEqual([]);
  });
});

describe("concrete penalty in a session", () => {
  it("charges each concrete box once, separately from the action cost", () => {
    const session = new GameSession(B([["fullSand"], ["fullSand"], ["fullWater"]]));
    const shelves = new ShelfManager(3, 1);
    shelves.pull("horizontal", 0);
    shelves.pull("horizontal", 1);
    shelves.update(SHELF_ANIMATION_MS);

    expect(session.apply({ kind: "topDown", row: 1, col: 0 }, shelves).ok).toBe(true);
    expect(session.apply(A00, shelves).ok).toBe(true);
    expect(session.apply({ kind: "topDown", row: 1, col: 0 }, shelves).ok).toBe(true);

    expect(session.concreteBoxes.size).toBe(1);
    expect(session.penaltyTotal).toBe(10);
    expect(session.actionCostTotal).toBe(19);
    expect(session.totalCost).toBe(29);
    expect(session.history.map((h) => h.concretePenalty)).toEqual([10, 0, 0]);
  });

  it("reset clears the concrete boxes and the penalty", () => {
    const session = new GameSession(B([["fullSand"], ["fullWater"]]));
    const shelves = new ShelfManager(2, 1);
    shelves.pull("horizontal", 0);
    shelves.update(SHELF_ANIMATION_MS);
    session.apply(A00, shelves);
    session.reset();
    expect(session.concreteBoxes.size).toBe(0);
    expect(session.penaltyTotal).toBe(0);
    expect(session.totalCost).toBe(0);
    expect(session.world.toKinds()).toEqual([["fullSand"], ["fullWater"]]);
  });
});

describe("Mode B solver", () => {
  it("finds a goal path and includes the concrete penalty in the total cost", () => {
    const r = solve(B([["fullSand"], ["fullWater"]]));
    expect(r.found).toBe(true);
    expect(r.totalCost).toBe(r.actionCostTotal + r.penaltyTotal);
    const finalKinds = r.steps.at(-1)?.kinds.flat() ?? [];
    expect(finalKinds.some((k) => k === "fullSand" || k === "halfSand")).toBe(false);
  });

  it("prefers the container route over forming concrete when that is strictly cheaper", () => {
    // half sand over water. Container route: water out (5), half sand down (3), half sand out (3) = 11.
    // Concrete route: half sand onto water = 3 + penalty 10 = 13. So 11 wins, with no concrete.
    const r = solve(B([["halfSand"], ["fullWater"]]));
    expect(r.found).toBe(true);
    expect(r.totalCost).toBe(11);
    expect(r.penaltyTotal).toBe(0);
    expect(concreteCount(B([["halfSand"], ["fullWater"]]))).toBe(0);
  });

  it("reports failure when a sand box is sealed in by concrete", () => {
    // The only box below the sand is concrete, and there is no side neighbour.
    const r = solve(B([["fullSand"], ["concrete"]]));
    expect(r.found).toBe(false);
    expect(r.reason.length).toBeGreaterThan(0);
  });
});
