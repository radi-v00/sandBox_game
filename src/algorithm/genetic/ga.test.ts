import { describe, expect, it } from "vitest";
import { simulateSequence, isSuccessfulPath } from "./simulate";
import { fitnessOf } from "./fitness";
import { crossover, mutate } from "./operators";
import { select } from "./selection";
import { createRng } from "./random";
import { runGeneticAlgorithm } from "./ga";
import { resolveConfig, DEFAULT_GA_CONFIG } from "./config";
import type { GADependencies, Sequence, SimulationResult } from "./types";

// Toy world: integer counter, goal at n >= 5, conflict = 5 - n, cost = 1 per step.
const initialWorld = { n: 0 } as any;

const deps: GADependencies = {
  initialWorld,
  applyGate: (w: any, req: any) =>
    req.kind === "inc"
      ? { ok: true, world: { ...w, n: w.n + 1 } as any, outcome: {} }
      : { ok: false, reason: "unknown" },
  isGoal: (w: any) => w.n >= 5,
  conflictNumber: (w: any) => Math.max(0, 5 - w.n),
  stepCost: () => 1,
  actionPool: [{ kind: "inc", row: 0, col: 0 } as any],
};

const testCfg = {
  ...DEFAULT_GA_CONFIG,
  sequenceLength: 20,
  populationSize: 40,
  maxGenerations: 100,
  eliteCount: 2,
  fitness: {
    goalBase: 1000,
    nonGoalScale: 999,
    conflictTransform: "identity" as const,
  },
  rngSeed: 7,
};

describe("simulate", () => {
  it("truncates at first goal", () => {
    const seq: Sequence = Array.from(
      { length: 10 },
      () => ({ kind: "inc" }) as any,
    );
    const r = simulateSequence(seq, deps);
    expect(r.valid).toBe(true);
    expect(r.success).toBe(true);
    expect(r.goalStep).toBe(4);
    expect(r.pathCost).toBe(5);
    expect(r.minConflict).toBe(0);
  });

  it("tracks min conflict over trajectory (not final)", () => {
    const seq: Sequence = Array.from(
      { length: 4 },
      () => ({ kind: "inc" }) as any,
    );
    const r = simulateSequence(seq, deps);
    expect(r.success).toBe(false);
    expect(r.minConflict).toBe(1);
  });

  it("illegal action -> valid=false, stop", () => {
    const seq: Sequence = [{ kind: "bad" } as any, { kind: "inc" } as any];
    const r = simulateSequence(seq, deps);
    expect(r.valid).toBe(false);
    expect(r.success).toBe(false);
  });

  it("isSuccessfulPath agrees with simulate().success", () => {
    expect(
      isSuccessfulPath(
        Array.from({ length: 5 }, () => ({ kind: "inc" }) as any),
        deps,
      ),
    ).toBe(true);
    expect(
      isSuccessfulPath(
        Array.from({ length: 3 }, () => ({ kind: "inc" }) as any),
        deps,
      ),
    ).toBe(false);
  });
});

describe("fitness", () => {
  it("goal strictly outranks non-goal", () => {
    const goal = simulateSequence(
      Array.from({ length: 5 }, () => ({ kind: "inc" }) as any),
      deps,
    );
    const near = simulateSequence(
      Array.from({ length: 4 }, () => ({ kind: "inc" }) as any),
      deps,
    );
    expect(fitnessOf(goal, testCfg.fitness)).toBeGreaterThan(
      fitnessOf(near, testCfg.fitness),
    );
  });

  it("shorter goal path beats longer goal path", () => {
    // NOTE: simulateSequence truncates at first goal, so two sequences that
    // both reach goal in the same step have identical pathCost. Exercise the
    // fitness rule directly via constructed SimulationResult values.
    const shortResult: SimulationResult = {
      valid: true,
      success: true,
      goalStep: 4,
      pathCost: 5,
      minConflict: 0,
      finalWorld: null as any,
    };
    const longResult: SimulationResult = {
      valid: true,
      success: true,
      goalStep: 9,
      pathCost: 10,
      minConflict: 0,
      finalWorld: null as any,
    };
    expect(fitnessOf(shortResult, testCfg.fitness)).toBeGreaterThan(
      fitnessOf(longResult, testCfg.fitness),
    );
  });

  it("illegal sequence -> 0", () => {
    const r = simulateSequence([{ kind: "bad" } as any], deps);
    expect(fitnessOf(r, testCfg.fitness)).toBe(0);
  });

  it("closer non-goal beats distant non-goal", () => {
    const close = simulateSequence(
      Array.from({ length: 4 }, () => ({ kind: "inc" }) as any),
      deps,
    );
    const far = simulateSequence([{ kind: "inc" } as any], deps);
    expect(fitnessOf(close, testCfg.fitness)).toBeGreaterThan(
      fitnessOf(far, testCfg.fitness),
    );
  });
});

describe("operators", () => {
  it("single-point crossover preserves length and swaps tails", () => {
    const p1: Sequence = Array.from(
      { length: 6 },
      () => ({ kind: "inc" }) as any,
    );
    const p2: Sequence = Array.from(
      { length: 6 },
      () => ({ kind: "bad" }) as any,
    );
    const rng = createRng(1);
    const [c1, c2] = crossover(p1, p2, "single", rng);
    expect(c1.length).toBe(6);
    expect(c2.length).toBe(6);
    expect(c1[0].kind).toBe("inc");
    expect(c1[5].kind).toBe("bad");
    expect(c2[0].kind).toBe("bad");
    expect(c2[5].kind).toBe("inc");
  });

  it("mutation is deterministic per seed and preserves length", () => {
    const seq: Sequence = Array.from(
      { length: 8 },
      () => ({ kind: "inc" }) as any,
    );
    const a = mutate(seq, deps.actionPool, createRng(42), 3);
    const b = mutate(seq, deps.actionPool, createRng(42), 3);
    expect(a.length).toBe(8);
    expect(a).toEqual(b);
  });
});

describe("selection", () => {
  it("fitter individuals selected more often (tournament)", () => {
    const pop: Sequence[] = [
      Array.from({ length: 4 }, () => ({ kind: "inc" }) as any),
      Array.from({ length: 4 }, () => ({ kind: "bad" }) as any),
      Array.from({ length: 4 }, () => ({ kind: "inc" }) as any),
    ];
    const fit = [10, 1, 9];
    const pool = select(pop, fit, 300, testCfg, createRng(1));
    expect(pool.length).toBe(300);
    const badCount = pool.filter((s) => s[0].kind === "bad").length;
    expect(badCount).toBeLessThan(150);
  });
});

describe("GA end-to-end", () => {
  it("solves the toy goal", () => {
    const out = runGeneticAlgorithm(testCfg, deps);
    expect(out.solved).toBe(true);
    expect(out.best.result.success).toBe(true);
    expect(out.best.fitness).toBeGreaterThanOrEqual(
      testCfg.fitness.goalBase - testCfg.sequenceLength,
    );
    expect(out.history.length).toBeGreaterThan(0);
    for (let i = 1; i < out.history.length; i++) {
      expect(out.history[i].bestFitness).toBeGreaterThanOrEqual(
        out.history[i - 1].bestFitness,
      );
    }
  });

  it("resolveConfig derives sequenceLength from board size", () => {
    const fake = { rows: 4, cols: 2 } as any;
    const cfg = resolveConfig(fake, {});
    expect(cfg.sequenceLength).toBe(Math.max(30, 4 * 2 * 3));
  });
});
