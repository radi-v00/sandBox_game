import { describe, expect, it } from "vitest";
import { generateProblems, DEFAULT_BENCHMARK_CONFIG } from "./problemGen";
import { computeMetrics } from "./metrics";
import { renderMarkdown } from "./report";
import type { ProblemResult } from "./types";

describe("problemGen", () => {
  it("is deterministic for the same seed", () => {
    const a = generateProblems({ ...DEFAULT_BENCHMARK_CONFIG, count: 3, baseSeed: 100 });
    const b = generateProblems({ ...DEFAULT_BENCHMARK_CONFIG, count: 3, baseSeed: 100 });
    expect(a.map((p) => p.seed)).toEqual(b.map((p) => p.seed));
    expect(a.map((p) => JSON.stringify(p.initialKinds))).toEqual(
      b.map((p) => JSON.stringify(p.initialKinds)),
    );
  });

  it("produces the requested count", () => {
    expect(generateProblems({ ...DEFAULT_BENCHMARK_CONFIG, count: 7 })).toHaveLength(7);
  });

  it("assigns consecutive problem seeds and shifted GA seeds", () => {
    const ps = generateProblems({
      ...DEFAULT_BENCHMARK_CONFIG,
      count: 3,
      baseSeed: 500,
      gaSeedOffset: 2000,
    });
    expect(ps.map((p) => p.seed)).toEqual([500, 501, 502]);
    expect(ps.map((p) => p.gaSeed)).toEqual([2500, 2501, 2502]);
  });
});

describe("metrics", () => {
  function fakeResult(overrides: Partial<ProblemResult>): ProblemResult {
    return {
      index: 0,
      seed: 0,
      gaSeed: 0,
      initialKinds: [["empty"]],
      gaFound: false,
      gaCost: null,
      gaPathLength: 0,
      gaGenerations: 0,
      gaMs: 1,
      ucsFound: false,
      ucsCost: null,
      ucsExpanded: 0,
      ucsMs: 1,
      ucsReason: "",
      ratio: null,
      ratioStatus: "neither",
      ...overrides,
    };
  }

  it("computes success counts and optimal count", () => {
    const results: ProblemResult[] = [
      fakeResult({ gaFound: true, gaCost: 10, ucsFound: true, ucsCost: 10, ratio: 1.0, ratioStatus: "both-found" }),
      fakeResult({ index: 1, seed: 1, gaFound: true, gaCost: 15, ucsFound: true, ucsCost: 10, ratio: 1.5, ratioStatus: "both-found" }),
      fakeResult({ index: 2, seed: 2, gaFound: true, gaCost: 20, ucsFound: false, ratioStatus: "ga-only" }),
      fakeResult({ index: 3, seed: 3, gaFound: false, ucsFound: true, ucsCost: 10, ratioStatus: "ucs-only" }),
      fakeResult({ index: 4, seed: 4, gaFound: false, ucsFound: false, ratioStatus: "neither" }),
    ];
    const m = computeMetrics(results);
    expect(m.totalProblems).toBe(5);
    expect(m.gaSuccesses).toBe(3);
    expect(m.gaSuccessWithOptimum).toBe(1);
    expect(m.gaSuccessWithOptimumPercentOfGaSuccess).toBeCloseTo(33.3, 1);
    expect(m.measurableCount).toBe(2);
    expect(m.meanRatioOverMeasurable).toBeCloseTo(1.25, 4);
    expect(m.medianRatioOverMeasurable).toBeCloseTo(1.25, 4);
    expect(m.gaFailures).toBe(2);
    expect(m.ucsFailures).toBe(2);
    expect(m.bothFailed).toBe(1);
  });

  it("handles empty input", () => {
    const m = computeMetrics([]);
    expect(m.totalProblems).toBe(0);
    expect(m.gaSuccesses).toBe(0);
    expect(m.meanRatioOverMeasurable).toBeNull();
  });

  it("counts ratio buckets", () => {
    const results: ProblemResult[] = [
      fakeResult({ gaFound: true, gaCost: 10, ucsFound: true, ucsCost: 10, ratio: 1.0 }),
      fakeResult({ index: 1, seed: 1, gaFound: true, gaCost: 11, ucsFound: true, ucsCost: 10, ratio: 1.1 }),
      fakeResult({ index: 2, seed: 2, gaFound: true, gaCost: 12, ucsFound: true, ucsCost: 10, ratio: 1.2 }),
      fakeResult({ index: 3, seed: 3, gaFound: true, gaCost: 30, ucsFound: true, ucsCost: 10, ratio: 3.0 }),
    ];
    const m = computeMetrics(results);
    expect(m.ratioBuckets.equal).toBe(1);
    expect(m.ratioBuckets.upTo110).toBe(1);
    expect(m.ratioBuckets.upTo125).toBe(1);
    expect(m.ratioBuckets.over200).toBe(1);
  });
});

describe("report", () => {
  it("renders the required sections without crashing", () => {
    const results: ProblemResult[] = [
      {
        index: 0,
        seed: 1000,
        gaSeed: 2000,
        initialKinds: [["empty"]],
        gaFound: true,
        gaCost: 10,
        gaPathLength: 2,
        gaGenerations: 5,
        gaMs: 100,
        ucsFound: true,
        ucsCost: 10,
        ucsExpanded: 20,
        ucsMs: 5,
        ucsReason: "Goal reached.",
        ratio: 1.0,
        ratioStatus: "both-found",
      },
    ];
    const m = computeMetrics(results);
    const md = renderMarkdown(m, results, "count = 1");
    expect(md).toContain("# Benchmark Report");
    expect(md).toContain("Required indicators");
    expect(md).toContain("Per-problem results");
    expect(md).toContain("## Notes");
  });
});
