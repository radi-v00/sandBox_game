import { solve } from "../../../planning/solver";
import type { World } from "../../../world/world";

export interface OptimalResult {
  found: boolean;
  cost: number | null;
  expanded: number;
  ms: number;
  reason: string;
}

export function solveOptimal(world: World, maxExpansions: number): OptimalResult {
  const t0 = performance.now();
  const result = solve(world, { maxExpansions });
  const ms = performance.now() - t0;
  return {
    found: result.found,
    cost: result.found ? result.totalCost : null,
    expanded: result.expanded,
    ms,
    reason: result.reason,
  };
}
