import type { Metrics, ProblemResult } from "./types";

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
};

export function computeMetrics(results: ProblemResult[]): Metrics {
  const totalProblems = results.length;
  const gaSuccesses = results.filter((r) => r.gaFound).length;
  const gaSuccessRatePercent = totalProblems > 0 ? (gaSuccesses / totalProblems) * 100 : 0;

  const gaSuccessWithOptimum = results.filter(
    (r) => r.gaFound && r.ucsFound && r.gaCost !== null && r.ucsCost !== null && r.gaCost === r.ucsCost,
  ).length;

  const measurableRatios = results.filter((r) => r.ratio !== null).map((r) => r.ratio as number);
  const measurableCount = measurableRatios.length;

  const gaFailures = results.filter((r) => !r.gaFound).length;
  const ucsFailures = results.filter((r) => !r.ucsFound).length;
  const bothFailed = results.filter((r) => !r.gaFound && !r.ucsFound).length;

  const gaTimes = results.map((r) => r.gaMs);
  const ucsTimes = results.map((r) => r.ucsMs);

  return {
    totalProblems,
    gaSuccesses,
    gaSuccessRatePercent,
    gaSuccessWithOptimum,
    gaSuccessWithOptimumPercentOfGaSuccess: gaSuccesses > 0 ? (gaSuccessWithOptimum / gaSuccesses) * 100 : 0,
    gaSuccessWithOptimumPercentOfAll: totalProblems > 0 ? (gaSuccessWithOptimum / totalProblems) * 100 : 0,
    meanRatioOverMeasurable: mean(measurableRatios),
    measurableCount,
    medianRatioOverMeasurable: median(measurableRatios),
    meanRatioOverGaSolved: mean(measurableRatios),
    gaSolvedWithOptimumCount: measurableCount,
    gaFailures,
    ucsFailures,
    bothFailed,
    gaAvgMs: mean(gaTimes) ?? 0,
    ucsAvgMs: mean(ucsTimes) ?? 0,
    totalGaMs: gaTimes.reduce((a, b) => a + b, 0),
    totalUcsMs: ucsTimes.reduce((a, b) => a + b, 0),
    minRatio: measurableRatios.length > 0 ? Math.min(...measurableRatios) : null,
    maxRatio: measurableRatios.length > 0 ? Math.max(...measurableRatios) : null,
    ratioBuckets: {
      equal: results.filter((r) => r.ratio === 1).length,
      upTo110: results.filter((r) => r.ratio !== null && r.ratio > 1 && r.ratio <= 1.1).length,
      upTo125: results.filter((r) => r.ratio !== null && r.ratio > 1.1 && r.ratio <= 1.25).length,
      upTo150: results.filter((r) => r.ratio !== null && r.ratio > 1.25 && r.ratio <= 1.5).length,
      upTo200: results.filter((r) => r.ratio !== null && r.ratio > 1.5 && r.ratio <= 2.0).length,
      over200: results.filter((r) => r.ratio !== null && r.ratio > 2.0).length,
    },
  };
}
