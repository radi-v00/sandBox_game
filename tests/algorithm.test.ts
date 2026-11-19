import assert from "node:assert/strict";
import { makeBox, World } from "../src/world";
import { initialFrom, isSideFeasible } from "../src/algorithm/common";
import { dummy } from "../src/algorithm/dummy";
import { bfs }   from "../src/algorithm/bfs";
import { dfs }   from "../src/algorithm/dfs";
import { ucs }   from "../src/algorithm/ucs";
import { astar } from "../src/algorithm/astar";

function board3x1(): World {
  return new World(3, 1, [
    [makeBox("sand", 1)],
    [makeBox("sand", 1)],
    [makeBox("empty", 0)],
  ]);
}

// 3x1 bug board - optimal cost 20 (4 pulls x cost 5, no cascade)
{
  const r = ucs(initialFrom(board3x1()));
  assert.equal(r.found, true);
  assert.equal(r.totalCost, 20);
  assert.equal(r.path.length, 4);
}

// A* == UCS with h = 0
{
  const u = ucs(initialFrom(board3x1()));
  const a = astar(initialFrom(board3x1()));
  assert.equal(a.found, true);
  assert.equal(a.totalCost, u.totalCost);
}

// BFS finds a solution (min-action count coincides with min-cost here)
{
  const r = bfs(initialFrom(board3x1()));
  assert.equal(r.found, true);
  assert.ok(r.totalCost >= 20);
}

// DFS finds *some* solution with cost >= optimal
{
  const r = dfs(initialFrom(board3x1()));
  assert.equal(r.found, true);
  assert.ok(r.totalCost >= 20);
}

// Dummy reports not-found on unsolved board
{
  const r = dummy(initialFrom(board3x1()));
  assert.equal(r.found, false);
}

// Already-solved board - empty path, cost 0, for every algorithm
{
  const solved = new World(2, 1, [
    [makeBox("water", 1)],
    [makeBox("concrete", 1)],
  ]);
  for (const algo of [dummy, bfs, dfs, ucs, astar]) {
    const r = algo(initialFrom(solved));
    assert.equal(r.found, true);
    assert.equal(r.path.length, 0);
    assert.equal(r.totalCost, 0);
  }
}

// Side gate feasibility - source 0.5 with TWO empties is infeasible (needs 1.0)
{
  const w = new World(1, 3, [
    [makeBox("sand", 0.5), makeBox("empty", 0), makeBox("sand", 1)],
  ]);
  assert.equal(isSideFeasible(initialFrom(w), 0, 1), false);
}

// Side gate feasibility - source 1.0 with TWO empties is feasible
{
  const w = new World(1, 3, [
    [makeBox("sand", 1), makeBox("empty", 0), makeBox("sand", 1)],
  ]);
  assert.equal(isSideFeasible(initialFrom(w), 0, 1), true);
}

// Side gate - no gates at edge columns
{
  const w = new World(1, 3, [
    [makeBox("sand", 1), makeBox("empty", 0), makeBox("sand", 1)],
  ]);
  assert.equal(isSideFeasible(initialFrom(w), 0, 0), false);
  assert.equal(isSideFeasible(initialFrom(w), 0, 2), false);
}

console.log("all algorithm tests passed");
