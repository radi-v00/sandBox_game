// Regression test for UCS suboptimal-cost fix.
// Board: [fullSand, fullSand, empty] - optimal is 3 actions in order 0,1,2 for total cost 23.
// The pre-fix bug returned 25 (5 actions) because the cascade deleted (1,0) from the open set
// mid-cascade, killing the 0 -> 1 -> 2 triple hop.
import { describe, it, expect } from "vitest";
import { World } from "../src/world/world";
import { initialFrom } from "../src/algorithm/common";
import { ucs } from "../src/algorithm/ucs";

describe("UCS cascade fix (step-01)", () => {
  it("returns cost 23 with 3 actions in order 0,1,2 on [fullSand, fullSand, empty]", () => {
    const board = World.fromKinds([["fullSand"], ["fullSand"], ["empty"]], "A");
    const r = ucs(initialFrom(board));

    expect(r.found).toBe(true);
    expect(r.totalCost).toBe(23);
    expect(r.path.length).toBe(3);
    expect([r.path[0].row, r.path[1].row, r.path[2].row]).toEqual([0, 1, 2]);
  });
});