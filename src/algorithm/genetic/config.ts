import type { GAConfig } from "./types";
import type { World } from "../../world/world";

export const DEFAULT_GA_CONFIG: GAConfig = {
  sequenceLength: 30,
  populationSize: 80,
  maxGenerations: 200,
  crossoverRate: 0.9,
  mutationRate: 0.3,
  maxMutationsPerIndividual: 2,
  eliteCount: 2,
  selectionMethod: "tournament",
  tournamentSize: 3,
  crossoverType: "single",
  fitness: {
    goalBase: 100_000,
    nonGoalScale: 99_999,
    conflictTransform: "identity",
  },
  rngSeed: 12345,
};

export function resolveConfig(world: World, partial: Partial<GAConfig> = {}): GAConfig {
  const derivedLength = Math.max(30, world.rows * world.cols * 3);
  return {
    sequenceLength: partial.sequenceLength ?? derivedLength,
    populationSize: partial.populationSize ?? DEFAULT_GA_CONFIG.populationSize,
    maxGenerations: partial.maxGenerations ?? DEFAULT_GA_CONFIG.maxGenerations,
    crossoverRate: partial.crossoverRate ?? DEFAULT_GA_CONFIG.crossoverRate,
    mutationRate: partial.mutationRate ?? DEFAULT_GA_CONFIG.mutationRate,
    maxMutationsPerIndividual:
      partial.maxMutationsPerIndividual ?? DEFAULT_GA_CONFIG.maxMutationsPerIndividual,
    eliteCount: partial.eliteCount ?? DEFAULT_GA_CONFIG.eliteCount,
    selectionMethod: partial.selectionMethod ?? DEFAULT_GA_CONFIG.selectionMethod,
    tournamentSize: partial.tournamentSize ?? DEFAULT_GA_CONFIG.tournamentSize,
    crossoverType: partial.crossoverType ?? DEFAULT_GA_CONFIG.crossoverType,
    fitness: { ...DEFAULT_GA_CONFIG.fitness, ...(partial.fitness ?? {}) },
    rngSeed: partial.rngSeed ?? DEFAULT_GA_CONFIG.rngSeed,
  };
}
