import type { BenchmarkConfig, Problem, ProblemResult } from "./types";
import { solveOptimal } from "./optimal";
import { resolveConfig } from "../config";
import { buildGADependencies } from "../world-deps";
import { runGeneticAlgorithm } from "../ga";

export function runOne(problem: Problem, config: BenchmarkConfig): ProblemResult {
  const ucs = solveOptimal(problem.world, config.ucsMaxExpansions);

  const gaConfig = resolveConfig(problem.world, {
    ...config.gaConfigOverrides,
    rngSeed: problem.gaSeed,
  });
  const gaDeps = buildGADependencies(problem.world);
  const gaT0 = performance.now();
  const gaRun = runGeneticAlgorithm(gaConfig, gaDeps);
  const gaMs = performance.now() - gaT0;

  const gaFound = gaRun.best.result.success;
  const gaCost = gaFound ? gaRun.best.result.pathCost : null;
  const gaPathLength = !gaFound
    ? 0
    : gaRun.best.result.goalStep !== null && gaRun.best.result.goalStep >= 0
      ? gaRun.best.result.goalStep + 1
      : gaRun.best.sequence.length;

  let ratio: number | null = null;
  let ratioStatus: ProblemResult["ratioStatus"];
  if (gaFound && ucs.found && gaCost !== null && ucs.cost !== null) {
    ratio = gaCost / ucs.cost;
    ratioStatus = "both-found";
  } else if (gaFound) {
    ratioStatus = "ga-only";
  } else if (ucs.found) {
    ratioStatus = "ucs-only";
  } else {
    ratioStatus = "neither";
  }

  return {
    index: problem.index,
    seed: problem.seed,
    gaSeed: problem.gaSeed,
    initialKinds: problem.initialKinds,
    gaFound,
    gaCost,
    gaPathLength,
    gaGenerations: gaRun.generations,
    gaMs,
    ucsFound: ucs.found,
    ucsCost: ucs.cost,
    ucsExpanded: ucs.expanded,
    ucsMs: ucs.ms,
    ucsReason: ucs.reason,
    ratio,
    ratioStatus,
  };
}

export function runBenchmark(problems: Problem[], config: BenchmarkConfig): ProblemResult[] {
  return problems.map((p) => runOne(p, config));
}
