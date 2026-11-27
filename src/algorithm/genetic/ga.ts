import type {
  Evaluation,
  GAConfig,
  GADependencies,
  GARunResult,
  GenerationStats,
  Sequence,
} from "./types";
import { simulateSequence } from "./simulate";
import { fitnessOf } from "./fitness";
import { crossover, mutate } from "./operators";
import { select } from "./selection";
import { createRng, randInt, type Rng } from "./random";

function randomSequence(
  n: number,
  pool: GADependencies["actionPool"],
  rng: Rng,
): Sequence {
  const s: Sequence = new Array(n);
  for (let i = 0; i < n; i++) s[i] = pool[randInt(rng, pool.length)]!;
  return s;
}

function evaluate(
  seq: Sequence,
  cfg: GAConfig,
  deps: GADependencies,
): Evaluation {
  const result = simulateSequence(seq, deps);
  return { sequence: seq, result, fitness: fitnessOf(result, cfg.fitness) };
}

const bestOf = (evs: Evaluation[]): Evaluation =>
  evs.reduce((a, b) => (b.fitness > a.fitness ? b : a));

export function runGeneticAlgorithm(
  cfg: GAConfig,
  deps: GADependencies,
): GARunResult {
  if (cfg.populationSize < 2) throw new Error("populationSize must be >= 2");
  if (cfg.sequenceLength < 1) throw new Error("sequenceLength must be >= 1");
  if (deps.actionPool.length === 0) throw new Error("actionPool is empty");

  const rng = createRng(cfg.rngSeed);
  const history: GenerationStats[] = [];

  let population: Sequence[] = Array.from({ length: cfg.populationSize }, () =>
    randomSequence(cfg.sequenceLength, deps.actionPool, rng),
  );
  let evaluations = population.map((s) => evaluate(s, cfg, deps));

  let best = bestOf(evaluations);
  let solved = best.result.success;
  let generation = 0;

  while (!solved && generation < cfg.maxGenerations) {
    const sorted = [...evaluations].sort((a, b) => b.fitness - a.fitness);
    const avg =
      evaluations.reduce((s, e) => s + e.fitness, 0) / evaluations.length;
    history.push({
      generation,
      bestFitness: sorted[0]!.fitness,
      avgFitness: avg,
      bestConflict: sorted[0]!.result.minConflict,
      bestPathCost: sorted[0]!.result.pathCost,
      solved,
    });

    const eliteCount = Math.min(cfg.eliteCount, cfg.populationSize - 1);
    const elites = sorted.slice(0, eliteCount).map((e) => [...e.sequence]);

    const poolSize = cfg.populationSize - eliteCount;
    const pool = select(
      population,
      evaluations.map((e) => e.fitness),
      poolSize,
      cfg,
      rng,
    );

    const children: Sequence[] = [];
    for (let i = 0; i + 1 < pool.length; i += 2) {
      const parent1 = pool[i]!;
      const parent2 = pool[i + 1]!;
      if (rng() < cfg.crossoverRate) {
        const [c1, c2] = crossover(parent1, parent2, cfg.crossoverType, rng);
        children.push(c1, c2);
      } else {
        children.push([...parent1], [...parent2]);
      }
    }
    if (pool.length % 2 === 1) {
      children.push([...pool[pool.length - 1]!]);
    }

    const mutated = children.map((c) =>
      rng() < cfg.mutationRate
        ? mutate(c, deps.actionPool, rng, cfg.maxMutationsPerIndividual)
        : c,
    );

    population = [...elites, ...mutated].slice(0, cfg.populationSize);
    evaluations = population.map((s) => evaluate(s, cfg, deps));

    const genBest = bestOf(evaluations);
    if (genBest.fitness > best.fitness) best = genBest;
    solved = best.result.success;
    generation++;
  }

  // Fallback: if the very first population already solved (loop never ran),
  // history would be empty. Record generation 0 so callers always have data.
  if (history.length === 0) {
    const sorted = [...evaluations].sort((a, b) => b.fitness - a.fitness);
    const avg =
      evaluations.reduce((s, e) => s + e.fitness, 0) / evaluations.length;
    history.push({
      generation: 0,
      bestFitness: sorted[0]!.fitness,
      avgFitness: avg,
      bestConflict: sorted[0]!.result.minConflict,
      bestPathCost: sorted[0]!.result.pathCost,
      solved: best.result.success,
    });
  }

  return { best, solved, generations: generation, history };
}
