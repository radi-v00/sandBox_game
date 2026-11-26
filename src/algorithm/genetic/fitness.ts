import type { FitnessConfig, SimulationResult } from "./types";

function transform(x: number, t: FitnessConfig["conflictTransform"]): number {
  switch (t) {
    case "log":  return Math.log1p(x);
    case "sqrt": return Math.sqrt(x);
    default:     return x;
  }
}

export function fitnessOf(result: SimulationResult, cfg: FitnessConfig): number {
  if (!result.valid) return 0;

  if (result.success) {
    return cfg.goalBase - result.pathCost;
  }

  const t = transform(result.minConflict, cfg.conflictTransform);
  return cfg.nonGoalScale / (1 + t);
}
