import { World } from "../../world/world";
import type { BoxKind, Mode } from "../../world/world";
import { runGeneticAlgorithm } from "./ga";
import { resolveConfig } from "./config";
import { buildGADependencies } from "./world-deps";
import type { GAConfig, GARunResult } from "./types";

export interface GARequest {
  kinds: BoxKind[][];
  mode: Mode;
  config?: Partial<GAConfig>;
}

export type GAResponse =
  | { type: "result"; result: GARunResult }
  | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<GARequest>) => {
  try {
    const world = World.fromKinds(e.data.kinds, e.data.mode);
    const cfg = resolveConfig(world, e.data.config ?? {});
    const deps = buildGADependencies(world);
    const result = runGeneticAlgorithm(cfg, deps);
    (self as unknown as Worker).postMessage({ type: "result", result } satisfies GAResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies GAResponse);
  }
};
