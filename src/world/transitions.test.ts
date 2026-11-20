import { describe, expect, it } from "vitest";
import { boxValue } from "./box";
import { applyGate } from "./transitions";
import { World } from "./world";

const ok = (world: World, kind: "topDown" | "sideGate", row: number, col: number) => {
  const r = applyGate(world, { kind, row, col });
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("Action A, Top-Down Gate", () => {
  it("full box into empty box: s=1, s'=0, cost 5", () => {
    const r = ok(World.predefined4x2(), "topDown", 0, 0);
    expect(r.outcome.sBefore).toBe(1);
    expect(r.outcome.sAfter).toBe(0);
    expect(r.outcome.cost).toBe(5);
    expect(r.world.toMatrix()).toEqual([[0, 0], [1, 1], [0, 1], [1, 0]]);
  });

  it("blocked by a full box below: s=1, s'=1, cost 9", () => {
    const r = ok(World.predefined4x2(), "topDown", 1, 1);
    expect(r.outcome.sAfter).toBe(1);
    expect(r.outcome.cost).toBe(9);
    expect(r.world.toMatrix()).toEqual(World.predefined4x2().toMatrix());
  });

  it("full box over half box: 0.5 moves, s'=0.5, cost 7", () => {
    const r = ok(World.fromMatrix([[1], [0.5]]), "topDown", 0, 0);
    expect(r.outcome.sAfter).toBe(0.5);
    expect(r.outcome.cost).toBe(7);
    expect(r.world.toMatrix()).toEqual([[0.5], [1]]);
  });

  it("half box into half box: s=0.5, s'=0, cost 3", () => {
    const r = ok(World.fromMatrix([[0.5], [0.5]]), "topDown", 0, 0);
    expect(r.outcome.cost).toBe(3);
    expect(r.world.toMatrix()).toEqual([[0], [1]]);
  });

  it("empty box: cost 1, nothing changes", () => {
    const r = ok(World.predefined4x2(), "topDown", 0, 1);
    expect(r.outcome.cost).toBe(1);
    expect(r.outcome.moved).toBe(0);
  });

  it("last row flushes into the container", () => {
    const r = ok(World.predefined4x2(), "topDown", 3, 0);
    expect(r.outcome.removed).toBe(1);
    expect(r.outcome.cost).toBe(5);
    expect(r.world.getBox(3, 0)).toBe("empty");
  });

  it("does not modify the input world", () => {
    const w = World.predefined4x2();
    ok(w, "topDown", 0, 0);
    expect(w.toMatrix()).toEqual([[1, 0], [0, 1], [0, 1], [1, 0]]);
  });
});

describe("Action B, Side Gate", () => {
  it("moves at most half of a full box to the right, cost 1", () => {
    const r = ok(World.fromMatrix([[1, 0]]), "sideGate", 0, 0);
    expect(r.outcome.cost).toBe(1);
    expect(r.outcome.sAfter).toBeNull();
    expect(r.world.toMatrix()).toEqual([[0.5, 0.5]]);
  });

  it("moves nothing from a half box but still costs 1", () => {
    const r = ok(World.fromMatrix([[0.5, 0]]), "sideGate", 0, 0);
    expect(r.outcome.moved).toBe(0);
    expect(r.outcome.cost).toBe(1);
  });

  it("is invalid in the last column", () => {
    expect(applyGate(World.predefined4x2(), { kind: "sideGate", row: 0, col: 1 }).ok).toBe(false);
  });

  it("rejects out-of-bounds boxes", () => {
    expect(applyGate(World.predefined4x2(), { kind: "topDown", row: 4, col: 0 }).ok).toBe(false);
  });
});

describe("Mode B value", () => {
  it("water and concrete have value 1", () => {
    expect(boxValue("fullWater")).toBe(1);
    expect(boxValue("concrete")).toBe(1);
  });
});
