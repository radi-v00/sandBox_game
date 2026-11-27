import type { GAConfig, Sequence } from "./types";
import type { Rng } from "./random";
import { randInt } from "./random";

export function select(
  population: Sequence[],
  fitnesses: number[],
  size: number,
  cfg: GAConfig,
  rng: Rng,
): Sequence[] {
  const pool: Sequence[] = [];

  if (cfg.selectionMethod === "tournament") {
    const k = Math.max(2, cfg.tournamentSize);
    for (let i = 0; i < size; i++) {
      let best = randInt(rng, population.length);
      for (let t = 1; t < k; t++) {
        const cand = randInt(rng, population.length);
        if ((fitnesses[cand] ?? -Infinity) > (fitnesses[best] ?? -Infinity))
          best = cand;
      }
      pool.push([...(population[best] ?? [])]);
    }
    return pool;
  }

  const total = fitnesses.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    for (let i = 0; i < size; i++)
      pool.push([...(population[randInt(rng, population.length)] ?? [])]);
    return pool;
  }

  for (let i = 0; i < size; i++) {
    let r = rng() * total;
    let idx = 0;
    while (idx < population.length - 1 && r > (fitnesses[idx] ?? -Infinity)) {
      r -= fitnesses[idx] ?? -Infinity;
      idx++;
    }
    pool.push([...(population[idx] ?? [])]);
  }
  return pool;
}
