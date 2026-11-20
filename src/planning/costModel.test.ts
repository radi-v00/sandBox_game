import { describe, expect, it } from "vitest";
import { CONCRETE_PENALTY, CostModel } from "./costModel";

describe("CostModel", () => {
  const table: [number, number, number][] = [
    [0, 0, 1],
    [0, 0.5, 3],
    [0, 1, 5],
    [0.5, 0, 3],
    [0.5, 0.5, 5],
    [0.5, 1, 7],
    [1, 0, 5],
    [1, 0.5, 7],
    [1, 1, 9],
  ];

  it.each(table)("topDownCost(%s, %s) = %s", (s, sAfter, expected) => {
    expect(CostModel.topDownCost(s, sAfter)).toBe(expected);
  });

  it("side gate costs 1", () => {
    expect(CostModel.sideGateCost()).toBe(1);
  });

  it("rejects values outside {0, 0.5, 1}", () => {
    expect(() => CostModel.topDownCost(0.25, 0)).toThrow();
    expect(() => CostModel.topDownCost(0, 2)).toThrow();
    expect(() => CostModel.topDownCost(-1, 0)).toThrow();
    expect(() => CostModel.topDownCost(NaN, 0)).toThrow();
  });

  it("concrete penalty is 10 per distinct box", () => {
    expect(CONCRETE_PENALTY).toBe(10);
    expect(CostModel.concretePenalty(0)).toBe(0);
    expect(CostModel.concretePenalty(3)).toBe(30);
    expect(() => CostModel.concretePenalty(-1)).toThrow();
    expect(() => CostModel.concretePenalty(1.5)).toThrow();
  });
});
