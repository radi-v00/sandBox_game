import type { World, BoxKind, Mode } from "../../world/world";
import type { GateRequest, TransitionResult } from "../../world/transitions";

export type Sequence = GateRequest[];

export type ConflictTransform = "identity" | "log" | "sqrt";

export interface FitnessConfig {
  goalBase: number;
  nonGoalScale: number;
  conflictTransform: ConflictTransform;
}

export interface GAConfig {
  sequenceLength: number;
  populationSize: number;
  maxGenerations: number;
  crossoverRate: number;
  mutationRate: number;
  maxMutationsPerIndividual: number;
  eliteCount: number;
  selectionMethod: "tournament" | "roulette";
  tournamentSize: number;
  crossoverType: "single" | "double";
  fitness: FitnessConfig;
  rngSeed: number;
}

export interface GADependencies {
  initialWorld: World;
  applyGate: (world: World, req: GateRequest) => TransitionResult;
  isGoal: (world: World) => boolean;
  conflictNumber: (world: World) => number;
  stepCost: (world: World, req: GateRequest, result: TransitionResult) => number;
  actionPool: GateRequest[];
}

export interface SimulationResult {
  valid: boolean;
  success: boolean;
  goalStep: number | null;
  pathCost: number;
  minConflict: number;
  finalWorld: World;
}

export interface Evaluation {
  sequence: Sequence;
  result: SimulationResult;
  fitness: number;
}

export interface GenerationStats {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  bestConflict: number;
  bestPathCost: number;
  solved: boolean;
}

export interface GARunResult {
  best: Evaluation;
  solved: boolean;
  generations: number;
  history: GenerationStats[];
}

export type { World, BoxKind, Mode, GateRequest, TransitionResult };
