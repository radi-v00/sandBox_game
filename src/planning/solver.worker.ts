import { World } from "../world/world";
import { solve, type SolveRequest, type SolveResponse } from "./solver";

const post = (message: SolveResponse) => (self as unknown as Worker).postMessage(message);

self.addEventListener("message", (event: MessageEvent<SolveRequest>) => {
  try {
    const { kinds, mode, maxExpansions } = event.data;
    const world = World.fromKinds(kinds, mode);
    post({ type: "result", result: solve(world, { maxExpansions }) });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
