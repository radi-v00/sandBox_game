import { World } from "../../../world/world";
import type { BenchmarkConfig, Problem } from "./types";

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  count: 100,
  baseSeed: 1000,
  rows: 4,
  cols: 2,
  mode: "A",
  probabilities: { empty: 1, halfSand: 1, fullSand: 1 },
  gaSeedOffset: 1000,
  ucsMaxExpansions: 1_000_000,
  gaConfigOverrides: {},
};

export function generateProblems(config: BenchmarkConfig = DEFAULT_BENCHMARK_CONFIG): Problem[] {
  const out: Problem[] = [];
  for (let i = 0; i < config.count; i++) {
    const seed = config.baseSeed + i;
    const world = World.random(config.rows, config.cols, config.mode, seed, config.probabilities);
    out.push({
      index: i,
      seed,
      gaSeed: config.baseSeed + i + config.gaSeedOffset,
      initialKinds: world.toKinds(),
      world,
    });
  }
  return out;
}
