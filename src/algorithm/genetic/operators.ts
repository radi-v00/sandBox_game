import type { GateRequest, Sequence } from "./types";
import type { Rng } from "./random";
import { pick, randInt } from "./random";

export function crossover(
  p1: Sequence,
  p2: Sequence,
  type: "single" | "double",
  rng: Rng,
): [Sequence, Sequence] {
  const n = p1.length;
  if (n < 2) return [[...p1], [...p2]];

  if (type === "single") {
    const cut = 1 + randInt(rng, n - 1);
    return [
      [...p1.slice(0, cut), ...p2.slice(cut)],
      [...p2.slice(0, cut), ...p1.slice(cut)],
    ];
  }

  const a = 1 + randInt(rng, n - 2);
  const b = a + 1 + randInt(rng, n - a - 1);
  return [
    [...p1.slice(0, a), ...p2.slice(a, b), ...p1.slice(b)],
    [...p2.slice(0, a), ...p1.slice(a, b), ...p2.slice(b)],
  ];
}

export function mutate(
  seq: Sequence,
  actionPool: GateRequest[],
  rng: Rng,
  maxMutations: number,
): Sequence {
  const child = [...seq];
  const edits = 1 + randInt(rng, Math.max(1, maxMutations));

  for (let k = 0; k < edits; k++) {
    if (rng() < 0.5) {
      const replacement = pick(rng, actionPool);
      if (replacement) {
        child[randInt(rng, child.length)] = replacement;
      }
    } else {
      const i = randInt(rng, child.length);
      const j = randInt(rng, child.length);
      const a = child[i];
      const b = child[j];
      if (a !== undefined && b !== undefined) {
        child[i] = b;
        child[j] = a;
      }
    }
  }
  return child;
}
