import type { BoxKind, Mode } from "../../../world/box";
import type { World } from "../../../world/world";
import type { GAConfig } from "../types";

export interface BenchmarkConfig {
  count: number;
  baseSeed: number;
  rows: number;
  cols: number;
  mode: Mode;
  probabilities: { empty: number; halfSand: number; fullSand: number; fullWater?: number };
  gaSeedOffset: number;
  ucsMaxExpansions: number;
  gaConfigOverrides: Partial<GAConfig>;
}

export interface Problem {
  index: number;
  seed: number;
  gaSeed: number;
  initialKinds: BoxKind[][];
  world: World;
}

export type RatioStatus = "both-found" | "ga-only" | "ucs-only" | "neither";

export interface ProblemResult {
  index: number;
  seed: number;
  gaSeed: number;
  initialKinds: BoxKind[][];
  gaFound: boolean;
  gaCost: number | null;
  gaPathLength: number;
  gaGenerations: number;
  gaMs: number;
  ucsFound: boolean;
  ucsCost: number | null;
  ucsExpanded: number;
  ucsMs: number;
  ucsReason: string;
  ratio: number | null;
  ratioStatus: RatioStatus;
}

export interface RatioBuckets {
  equal: number;
  upTo110: number;
  upTo125: number;
  upTo150: number;
  upTo200: number;
  over200: number;
}

export interface Metrics {
  totalProblems: number;
  gaSuccesses: number;
  gaSuccessRatePercent: number;
  gaSuccessWithOptimum: number;
  gaSuccessWithOptimumPercentOfGaSuccess: number;
  gaSuccessWithOptimumPercentOfAll: number;
  meanRatioOverMeasurable: number | null;
  measurableCount: number;
  medianRatioOverMeasurable: number | null;
  meanRatioOverGaSolved: number | null;
  gaSolvedWithOptimumCount: number;
  gaFailures: number;
  ucsFailures: number;
  bothFailed: number;
  gaAvgMs: number;
  ucsAvgMs: number;
  totalGaMs: number;
  totalUcsMs: number;
  minRatio: number | null;
  maxRatio: number | null;
  ratioBuckets: RatioBuckets;
}
