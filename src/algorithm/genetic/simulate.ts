import type { GADependencies, Sequence, SimulationResult } from "./types";

export function simulateSequence(seq: Sequence, deps: GADependencies): SimulationResult {
  let world = deps.initialWorld.clone();
  let pathCost = 0;

  const startGoal = deps.isGoal(world);
  let success = startGoal;
  let goalStep: number | null = startGoal ? -1 : null;
  let minConflict = startGoal ? 0 : deps.conflictNumber(world);

  for (let i = 0; i < seq.length && !success; i++) {
    const req = seq[i];
    let res;
    try {
      res = deps.applyGate(world, req);
    } catch {
      return { valid: false, success: false, goalStep: null, pathCost, minConflict, finalWorld: world };
    }
    if (!res.ok) {
      return { valid: false, success: false, goalStep: null, pathCost, minConflict, finalWorld: world };
    }

    pathCost += deps.stepCost(world, req, res);

    if (deps.isGoal(res.world)) {
      success = true;
      goalStep = i;
      minConflict = 0;
    } else {
      const c = deps.conflictNumber(res.world);
      if (c < minConflict) minConflict = c;
    }

    world = res.world;
  }

  return { valid: true, success, goalStep, pathCost, minConflict, finalWorld: world };
}

export function isSuccessfulPath(seq: Sequence, deps: GADependencies): boolean {
  return simulateSequence(seq, deps).success;
}
