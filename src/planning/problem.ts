import { applyGate, type ActionOutcome, type GateRequest } from "../world/transitions";
import type { World } from "../world/world";
import { allGateRequests } from "./actions";

export interface Successor {
  request: GateRequest;
  outcome: ActionOutcome;
  world: World;
}

export function isGoal(world: World): boolean {
  return world.isGoalState();
}

/**
 * Valid successors of a world, using the same applyGate as the interactive game.
 * Actions that move nothing are skipped: they only add positive cost and return to the same state,
 * so they can never be part of a minimum-cost path.
 */
export function successors(world: World): Successor[] {
  const list: Successor[] = [];
  for (const request of allGateRequests(world.rows, world.cols)) {
    const result = applyGate(world, request);
    if (!result.ok || result.outcome.moved === 0) continue;
    list.push({ request, outcome: result.outcome, world: result.world });
  }
  return list;
}
