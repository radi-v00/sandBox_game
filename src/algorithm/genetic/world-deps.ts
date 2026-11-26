import type { World, GateRequest, TransitionResult } from "./types";
import { applyGate } from "../../world/transitions";
import { sandBoxCount } from "../../world/stats";

// Per-step cost. transitions.ts::topDown/sideGate populate both fields:
//   outcome.cost            = base cost (topDown or sideGate)
//   outcome.concretePenalty = 10 * newConcrete.length
// NOTE: this does NOT include cascade penalty (cascade is not run in simulateSequence).
//       See header of step-04-wire-ga.ps1.
function stepCost(
  _world: World,
  _req: GateRequest,
  result: TransitionResult,
): number {
  if (!result.ok) return 0;
  return result.outcome.cost + result.outcome.concretePenalty;
}

function buildActionPool(rows: number, cols: number): GateRequest[] {
  const pool: GateRequest[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pool.push({ kind: "topDown", row: r, col: c });
      pool.push({ kind: "sideGate", row: r, col: c });
    }
  }
  return pool;
}

export function buildGADependencies(initialWorld: World) {
  return {
    initialWorld,
    applyGate,
    isGoal: (w: World) => w.isGoalState(),
    conflictNumber: (w: World) => sandBoxCount(w),
    stepCost,
    actionPool: buildActionPool(initialWorld.rows, initialWorld.cols),
  };
}