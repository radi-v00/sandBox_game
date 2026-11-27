import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateProblems, DEFAULT_BENCHMARK_CONFIG } from "./problemGen";
import { runBenchmark } from "./runner";
import { computeMetrics } from "./metrics";
import { renderMarkdown } from "./report";
import type { BenchmarkConfig } from "./types";

function printHelp() {
  console.log(`Usage: npm run benchmark -- [options]

Options:
  --count N              Number of problems (default 100)
  --seed N               Base seed (default 1000)
  --rows N               Board rows (default 4)
  --cols N               Board cols (default 2)
  --mode A|B             Game mode (default A)
  --ucs-max N            UCS maxExpansions (default 1000000)
  --ga-seed-offset N     GA seed offset (default 1000)
  --help, -h             Show this message`);
}

function parseArgs(argv: string[]): BenchmarkConfig {
  const config = { ...DEFAULT_BENCHMARK_CONFIG };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--count":          config.count = Number(next); i++; break;
      case "--seed":           config.baseSeed = Number(next); i++; break;
      case "--rows":           config.rows = Number(next); i++; break;
      case "--cols":           config.cols = Number(next); i++; break;
      case "--mode":           config.mode = next as "A" | "B"; i++; break;
      case "--ucs-max":        config.ucsMaxExpansions = Number(next); i++; break;
      case "--ga-seed-offset": config.gaSeedOffset = Number(next); i++; break;
      case "--help":
      case "-h":               printHelp(); process.exit(0);
      default:
        if (arg?.startsWith("--")) {
          console.error(`Unknown argument: ${arg}`);
          process.exit(1);
        }
    }
  }
  return config;
}

function main() {
  const config = parseArgs(process.argv.slice(2));

  console.log("Generating problems...");
  const problems = generateProblems(config);
  console.log(
    `Generated ${problems.length} problems (problem seeds ${config.baseSeed}..${config.baseSeed + problems.length - 1}; GA seeds ${config.baseSeed + config.gaSeedOffset}..${config.baseSeed + config.gaSeedOffset + problems.length - 1}).`,
  );

  console.log("Running benchmark (GA + UCS on each problem)...");
  const t0 = performance.now();
  const results = runBenchmark(problems, config);
  const totalMs = performance.now() - t0;
  console.log(`Benchmark complete in ${(totalMs / 1000).toFixed(2)} s.`);

  const metrics = computeMetrics(results);
  console.log("");
  console.log("=== Summary ===");
  console.log(`GA successes:                    ${metrics.gaSuccesses} / ${metrics.totalProblems}`);
  console.log(`GA optimal solutions:            ${metrics.gaSuccessWithOptimum} (${metrics.gaSuccessWithOptimumPercentOfGaSuccess.toFixed(1)}% of GA successes)`);
  console.log(`Mean GA/UCS ratio (measurable):  ${metrics.meanRatioOverMeasurable?.toFixed(4) ?? "N/A"} (N = ${metrics.measurableCount})`);
  console.log(`GA avg time:                     ${metrics.gaAvgMs.toFixed(1)} ms`);
  console.log(`UCS avg time:                    ${metrics.ucsAvgMs.toFixed(1)} ms`);

  const configHeader = [
    `count = ${config.count}`,
    `baseSeed = ${config.baseSeed}`,
    `rows = ${config.rows}, cols = ${config.cols}, mode = ${config.mode}`,
    `probabilities = ${JSON.stringify(config.probabilities)}`,
    `ucsMaxExpansions = ${config.ucsMaxExpansions}`,
    `gaSeedOffset = ${config.gaSeedOffset}`,
    `gaConfigOverrides = ${JSON.stringify(config.gaConfigOverrides)}`,
  ].join("\n");

  const jsonPath = resolve(process.cwd(), "benchmark-results.json");
  const reportPath = resolve(process.cwd(), "BENCHMARK_REPORT.md");

  writeFileSync(jsonPath, JSON.stringify({ config, metrics, results }, null, 2));
  console.log(`Wrote ${jsonPath}`);

  writeFileSync(reportPath, renderMarkdown(metrics, results, configHeader));
  console.log(`Wrote ${reportPath}`);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
