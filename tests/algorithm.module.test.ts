import { describe, it, expect } from "vitest";
import { ucs } from "../src/algorithm/ucs";
import { astar } from "../src/algorithm/astar";
import { bfs } from "../src/algorithm/bfs";
import { dfs } from "../src/algorithm/dfs";
import { dummy } from "../src/algorithm/dummy";
import { initialFrom } from "../src/algorithm/common";
import { World } from "../src/world/world";

describe("algorithm module sanity (post-fix)", () => {
  const board = World.fromKinds([["fullSand"], ["fullSand"], ["empty"]]);

  it("dummy returns not-found on a non-goal state", () => {
    expect(dummy(initialFrom(board)).found).toBe(false);
  });

  it("ucs finds a goal with positive cost", () => {
    const r = ucs(initialFrom(board));
    expect(r.found).toBe(true);
    expect(r.totalCost).toBeGreaterThan(0);
  });

  it("astar (h=0) agrees with ucs on cost", () => {
    const a = ucs(initialFrom(board));
    const b = astar(initialFrom(board));
    expect(b.found).toBe(a.found);
    expect(b.totalCost).toBe(a.totalCost);
  });

  it("bfs and dfs find a goal", () => {
    expect(bfs(initialFrom(board)).found).toBe(true);
    expect(dfs(initialFrom(board)).found).toBe(true);
  });
});