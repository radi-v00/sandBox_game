import { applyGate, type ActionOutcome, type GateRequest } from "../world/transitions";
import type { BoxKind, Mode } from "../world/box";
import type { World } from "../world/world";
import { MinHeap } from "./heap";
import { isGoal, successors } from "./problem";
import { worldKey } from "./state";

export const DEFAULT_MAX_EXPANSIONS = 1_000_000;

export interface SolveOptions {
  maxExpansions?: number;
}

export interface SolutionStep {
  request: GateRequest;
  outcome: ActionOutcome;
  /** World after this action (numeric values; water and concrete both read 1). */
  matrix: number[][];
  /** World after this action, exact box kinds. */
  kinds: BoxKind[][];
  /** Action costs plus concrete penalties up to this step. */
  runningTotal: number;
}

export interface SolveResult {
  found: boolean;
  reason: string;
  initialMatrix: number[][];
  initialKinds: BoxKind[][];
  steps: SolutionStep[];
  /** actionCostTotal + penaltyTotal. */
  totalCost: number;
  actionCostTotal: number;
  penaltyTotal: number;
  expanded: number;
}

export interface SolveRequest {
  kinds: BoxKind[][];
  mode: Mode;
  maxExpansions?: number;
}

export type SolveResponse = { type: "result"; result: SolveResult } | { type: "error"; message: string };

interface Link {
  prevKey: string;
  request: GateRequest;
}

interface QueueItem {
  key: string;
  world: World;
}

function failure(reason: string, initial: World, expanded: number): SolveResult {
  return {
    found: false,
    reason,
    initialMatrix: initial.toMatrix(),
    initialKinds: initial.toKinds(),
    steps: [],
    totalCost: 0,
    actionCostTotal: 0,
    penaltyTotal: 0,
    expanded,
  };
}

/**
 * Uniform Cost Search (Dijkstra) from the given world to the nearest goal state.
 * Edge weight = action cost + concrete penalty of that transition. Concrete is permanent,
 * so each concrete box is charged exactly once along any path.
 */
export function solve(initial: World, options: SolveOptions = {}): SolveResult {
  const maxExpansions = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;

  const startKey = worldKey(initial);
  const best = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, Link>();
  const closed = new Set<string>();
  const queue = new MinHeap<QueueItem>();
  queue.push({ key: startKey, world: initial }, 0);
  let expanded = 0;

  for (let item = queue.pop(); item !== undefined; item = queue.pop()) {
    const { key, world } = item.value;
    if (closed.has(key)) continue; // stale queue entry
    closed.add(key);

    if (isGoal(world)) return buildResult(initial, key, startKey, parent, expanded);

    if (expanded >= maxExpansions) {
      return failure(`Search limit reached after ${expanded} expanded states.`, initial, expanded);
    }
    expanded++;

    for (const next of successors(world)) {
      const nextKey = worldKey(next.world);
      if (closed.has(nextKey)) continue;
      const cost = item.priority + next.outcome.cost + next.outcome.concretePenalty;
      if (cost < (best.get(nextKey) ?? Infinity)) {
        best.set(nextKey, cost);
        parent.set(nextKey, { prevKey: key, request: next.request });
        queue.push({ key: nextKey, world: next.world }, cost);
      }
    }
  }

  return failure("No goal state is reachable.", initial, expanded);
}

function buildResult(
  initial: World,
  goalKey: string,
  startKey: string,
  parent: Map<string, Link>,
  expanded: number,
): SolveResult {
  const requests: GateRequest[] = [];
  for (let key = goalKey; key !== startKey; ) {
    const link = parent.get(key);
    if (link === undefined) throw new Error("Broken parent chain in solver.");
    requests.push(link.request);
    key = link.prevKey;
  }
  requests.reverse();

  // Replay with the shared transition function to get outcomes, worlds and totals.
  const steps: SolutionStep[] = [];
  let world = initial;
  let actionCostTotal = 0;
  let penaltyTotal = 0;
  for (const request of requests) {
    const result = applyGate(world, request);
    if (!result.ok) throw new Error(`Replay failed: ${result.reason}`);
    actionCostTotal += result.outcome.cost;
    penaltyTotal += result.outcome.concretePenalty;
    world = result.world;
    steps.push({
      request,
      outcome: result.outcome,
      matrix: world.toMatrix(),
      kinds: world.toKinds(),
      runningTotal: actionCostTotal + penaltyTotal,
    });
  }
  return {
    found: true,
    reason: "Goal reached.",
    initialMatrix: initial.toMatrix(),
    initialKinds: initial.toKinds(),
    steps,
    totalCost: actionCostTotal + penaltyTotal,
    actionCostTotal,
    penaltyTotal,
    expanded,
  };
}
