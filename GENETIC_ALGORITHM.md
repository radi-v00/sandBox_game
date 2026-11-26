# Genetic Algorithm — design, implementation, and integration

This document describes the **Genetic Algorithm (GA)** added to
`shelf-world-web`, why it was designed the way it was, and how it plugs
into the existing app. It is written as a *change proposal + reference
manual*: someone who has never seen the project should be able to read
this file and know exactly what the GA does, where it lives, and how to
tune it.

> TL;DR — each individual is a **fixed-length sequence of `GateRequest`
> actions** replayed from the initial world. Fitness is
> `goalBase − pathCost` if the sequence reaches the goal (0 sand
> boxes), otherwise `nonGoalScale / (1 + minConflict)` where
> `minConflict = sandBoxCount` minimized over the trajectory. Operators
> are single/double-point crossover and replace/swap mutation. Selection
> is tournament (k=3) or roulette. It runs in a Web Worker and returns
> a `SolveResult`-shaped result so the existing playback UI works
> unchanged.

---

## Table of contents

1. [Motivation](#motivation)
2. [High-level design](#high-level-design)
3. [The six steps from the plan](#the-six-steps-from-the-plan)
4. [File-by-file reference](#file-by-file-reference)
5. [Fitness function in detail](#fitness-function-in-detail)
6. [Configuration](#configuration)
7. [Integration with the UI](#integration-with-the-ui)
8. [Testing](#testing)
9. [Hyperparameter tuning](#hyperparameter-tuning)
10. [Known limitations](#known-limitations)
11. [What changed](#what-changed)

---

## Motivation

The existing solvers (BFS, DFS, UCS, A*) are **exhaustive** — they will
eventually find an optimal (UCS/A*) or any (DFS) solution, but they blow up
in memory on moderately-sized boards. For a 6×6 or larger board, the
state space is `5^(36)` — exponential. Even with a good heuristic, UCS/A*
will hit a memory wall.

The GA takes a different approach: **stochastic local search over sequences
of actions**. It does not guarantee an optimal solution, and it does not
guarantee finding *any* solution, but it can explore very large boards
in constant memory. It is the standard fallback when exact search is
infeasible.

The GA was added as a **new algorithm in the existing dropdown**, with
the same result shape as `worker-ucs`. No existing code was modified
in a breaking way.

---

## High-level design

Three pieces, no more:

```
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────┐
│  World (real)        │ ───▶│  GADependencies      │ ───▶│  GA core         │
│  applyGate, isGoal,  │      │  (injected functions)│      │  (pure, testable)│
│  sandBoxCount        │      │                       │      │                  │
└─────────────────────┘      └─────────────────────┘      └─────────────────┘
        ▲                            ▲                             │
        │                            │                             │
        └────── world-deps.ts ───────┴──────── ga.worker.ts ────────┘
```

* **The GA core** (`ga.ts`, `simulate.ts`, `fitness.ts`, `operators.ts`,
  `selection.ts`) is **pure** and does not import `World` at all. It
  only knows about `GADependencies` — a small interface with `applyGate`,
  `isGoal`, `conflictNumber`, `stepCost`, `actionPool`, `initialWorld`.
  This makes every module trivially testable with stubs.
* **`world-deps.ts`** is the only file that knows the real `World`,
  `applyGate`, `sandBoxCount`, and `CostModel`. It is 30 lines.
* **`ga.worker.ts`** deserializes `{ kinds, mode, config }`, builds a
  `World`, calls `buildGADependencies(world)`, runs
  `runGeneticAlgorithm(cfg, deps)`, and posts the result back — same
  convention as `solver.worker.ts`.

The key rule: **the GA never mutates a `World`**. Each `simulateSequence`
call clones the initial world first. Every individual is a fresh replay
from `initialWorld`, every generation. This is required for fitness to
be comparable across generations and across the population.

---

## The six steps from the plan

The GA implements the six-step plan literally.

### Step 1 — the problem

The problem is the existing shelf/sandbox game. No changes.

### Step 2 — sequence representation, truncate at goal

Each individual is a `Sequence = GateRequest[]` of **fixed length `N`**.
`simulateSequence` iterates through the sequence from `initialWorld` and
**truncates at the first goal**. Once `isGoal` returns true, remaining
actions are ignored.

```ts
// simulate.ts
for (let i = 0; i < seq.length && !success; i++) {
  const res = deps.applyGate(world, seq[i]);
  if (!res.ok) return { valid: false, ... };
  // ...
  if (deps.isGoal(res.world)) { success = true; goalStep = i; }
  world = res.world;
}
```

If an illegal action is hit (e.g., pulling from a concrete box, or a
side gate with no adjacent empty), the sequence is marked
`valid: false` and the replay stops. Its fitness becomes 0.

### Step 3 — `isSuccessfulPath(sequence)`

The plan asks for a goal test that takes a **sequence**, not a state.
That is:

```ts
isSuccessfulPath(seq: Sequence, deps: GADependencies): boolean
```

It runs `simulateSequence` and returns `result.success`. This is a
pre-test for "does this path succeed", distinct from `isGoal(world)`.

### Step 3′ — `conflictNumber(world)`

A heuristic approximation of distance to the goal. It must be
**0 iff the state is a goal**, so that it can be used both as a
fitness gradient *and* as a "we are done" check.

For this project:

```ts
conflictNumber: (w) => sandBoxCount(w)
```

`sandBoxCount` from `stats.ts` counts boxes containing sand. It is `0`
exactly when `w.isGoalState()` returns `true`. Perfect.

`simulateSequence` tracks the **minimum** conflict over the trajectory
(not the final value). The plan emphasizes this: a sequence might
*overshoot* the best state and ruin it, and we want to reward the best
state it *reached*, not its endpoint.

```ts
if (c < minConflict) minConflict = c;
```

### Step 4 — fitness / value function

`fitnessOf(result, cfg)` in `fitness.ts`:

```
illegal      → 0
goal         → goalBase - pathCost
non-goal     → nonGoalScale / (1 + f(minConflict))
```

Where `f` is `identity | log | sqrt`, selectable via config.

The plan is emphatic about two properties:

1. **Goal strictly outranks any non-goal.** Guaranteed by
   `goalBase > nonGoalScale`, and by `minConflict ≥ 1` for non-goals,
   which caps non-goals at `nonGoalScale / 2`.
2. **Always positive.** Both formulas are `> 0` for legal sequences.

The plan also asks us to *not* allow cheap paths to far states to score
high — the division `nonGoalScale / (1 + minConflict)` penalizes exactly
that. `nonGoalScale = 99_999`, so a state with `minConflict = 5` scores
`16_666` — well below any goal (which is at least `~99_990`).

Default constants:

```ts
goalBase:     100_000
nonGoalScale:  99_999
conflictTransform: "identity"
```

`goalBase` is high enough that no realistic path cost can exceed it. A
path of 40 steps each costing the maximum `9` plus 5 concrete boxes
costs `40·9 + 5·10 = 410` — nowhere near `100_000`. Non-goals therefore
*always* lose to goals. The gap is immense by design.

### Step 5 — mutation and crossover

Both are in `operators.ts`.

**Crossover** (`crossover(p1, p2, type, rng)`) — two parents, two children:

* `type = "single"` — one random cut point. Children are
  `prefix(p1) + suffix(p2)` and `prefix(p2) + suffix(p1)`.
* `type = "double"` — two random cut points `a < b`. Children are
  `p1[0..a] + p2[a..b] + p1[b..]` and `p2[0..a] + p1[a..b] + p2[b..]`.

**Mutation** (`mutate(seq, actionPool, rng, maxMutations)`) — stochastic
per plan. Each mutation is 1 to `maxMutations` edits, each independently:

* Replace a random gene with a random action from `actionPool`, or
* Swap two random genes.

`actionPool` is built from `world.rows × world.cols × {topDown, sideGate}`.
The pool contains *all possible* actions, including currently-illegal ones.
The `simulateSequence` function handles illegality by setting
`valid = false`.

### Step 6 — selection

`select(population, fitnesses, size, cfg, rng)` in `selection.ts`:

* **Tournament (k = 3, default)** — sample k individuals with
  replacement, return the fittest. Repeat `size` times.
* **Roulette** — fitness-proportionate sampling; degenerates to uniform
  if total fitness is 0.

Output is a list of length `size` (mating pool) that may contain
duplicates of the input population. The input population is *treated*
as unique; the GA does not enforce uniqueness across generations
(per the plan: "the input to select is unique; the output may be
duplicated").

### Driver (`ga.ts`)

```ts
function runGeneticAlgorithm(cfg, deps): GARunResult {
  // 1. init population: cfg.populationSize random sequences of length cfg.sequenceLength
  // 2. evaluate each: simulateSequence + fitnessOf
  // 3. loop until solved or maxGenerations:
  //    a. record GenerationStats
  //    b. elites = top cfg.eliteCount (copied)
  //    c. pool = select(population, fitnesses, populationSize - eliteCount)
  //    d. children = crossover(pool[i], pool[i+1]) pairwise
  //    e. mutated  = mutate(child) with probability cfg.mutationRate
  //    f. population = elites ++ mutated (truncated to populationSize)
  //    g. evaluate new population
  //    h. update best; check solved
  // 4. return { best, solved, generations, history }
}
```

`GARunResult.history` contains one `GenerationStats` per generation, so
the UI can show a plot of best/avg fitness, best conflict, and best
path cost over time.

---

## File-by-file reference

All files live in `src/algorithm/genetic/`.

### `types.ts`

The only file that talks to `World`. Exports:

* `Sequence`, `Evaluation`, `SimulationResult`, `GARunResult`,
  `GenerationStats`, `GAConfig`, `FitnessConfig`, `GADependencies`.
* Re-exports `World`, `BoxKind`, `Mode`, `GateRequest`, `TransitionResult`
  for convenience.

`GADependencies` is the injection interface:

```ts
interface GADependencies {
  initialWorld: World;
  applyGate: (world, req) => TransitionResult;
  isGoal: (world) => boolean;
  conflictNumber: (world) => number;     // 0 iff goal
  stepCost: (world, req, result) => number;
  actionPool: GateRequest[];
}
```

### `config.ts`

`DEFAULT_GA_CONFIG` — sensible defaults. `resolveConfig(world, partial)` —
deep-merges with defaults and derives `sequenceLength = max(30, rows·cols·3)`.

### `random.ts`

`createRng(seed)` (mulberry32, seeded), `randInt`, `pick`.
Determinism is essential: tests depend on specific seeds producing
specific populations.

### `fitness.ts`

`fitnessOf(result, cfg)`. Formula described in [§5](#fitness-function-in-detail).

### `simulate.ts`

`simulateSequence(seq, deps)` and `isSuccessfulPath(seq, deps)`.
Does the actual replay. Handles truncation, illegal actions, min-conflict
tracking, and path-cost accumulation.

### `operators.ts`

`crossover(p1, p2, type, rng)` and `mutate(seq, actionPool, rng, maxMut)`.
Both deterministic given the same RNG.

### `selection.ts`

`select(population, fitnesses, size, cfg, rng)`. Tournament and roulette.

### `ga.ts`

`runGeneticAlgorithm(cfg, deps)` — the loop. Calls `simulateSequence`,
`fitnessOf`, `select`, `crossover`, `mutate`.

### `world-deps.ts`

The **only** file that imports `applyGate`, `sandBoxCount`, and
`CostModel` from the rest of the codebase:

```ts
export function buildGADependencies(initialWorld: World) {
  return {
    initialWorld,
    applyGate,
    isGoal: (w) => w.isGoalState(),
    conflictNumber: (w) => sandBoxCount(w),
    stepCost: (_, __, result) =>
      result.ok ? result.outcome.cost + result.outcome.concretePenalty : 0,
    actionPool: buildActionPool(initialWorld.rows, initialWorld.cols),
  };
}
```

`stepCost` is *trivial* because `applyGate` already populates
`outcome.cost` and `outcome.concretePenalty`. No recomputation needed.

### `ga.worker.ts`

Web Worker. Accepts `GARequest = { kinds, mode, config? }`, returns
`GAResponse = { type: "result", result } | { type: "error", message }` —
the same convention as `solver.worker.ts`.

### `index.ts`

Barrel file: re-exports everything.

### `ga.test.ts`

Twelve tests covering every step, plus end-to-end solve on a toy problem.
See [§8](#testing).

---

## Fitness function in detail

For a sequence `s` replayed from `initialWorld`, let

* `valid(s)` — no illegal action was hit during the replay
* `success(s)` — the replay reached a goal (any prefix)
* `pathCost(s)` — sum of `stepCost` over the executed prefix
* `minConflict(s)` — minimum `conflictNumber` over all reached states

Then:

```
fitness(s) =
  0                                     if ¬valid(s)
  goalBase − pathCost(s)                if valid ∧ success
  nonGoalScale / (1 + f(minConflict(s)))  otherwise
```

Where `f` is `identity | log1p | sqrt`, configurable.

### Why this shape

The plan requires:

* **Always positive** — hold, both branches are `> 0` (except `¬valid → 0`,
  which the plan explicitly allows).
* **Goal strictly outranks non-goal** — hold, since `goalBase > nonGoalScale`
  and `minConflict ≥ 1` for non-goals caps them at `nonGoalScale / 2`.
* **Prefer cheaper goal paths** — hold, `goalBase − pathCost` is monotone
  decreasing in `pathCost`.
* **Prefer closer non-goal states** — hold, `nonGoalScale / (1 + minConflict)`
  is monotone decreasing in `minConflict`.
* **Never reward "cheap path to a far state"** — hold, the denominator
  `1 + minConflict` punishes distance from goal.

### What was NOT done and why

The plan mentions log/sqrt transforms on the conflict number. Those
would compress the range of fitnesses, but they'd also require
re-tuning `nonGoalScale` to preserve the "goals outrank non-goals"
property. For the current values (`sandBoxCount` is a small integer for
any realistic board), `identity` is the safest choice. `log` and `sqrt`
remain available in the config for experiments.

---

## Configuration

```ts
interface GAConfig {
  sequenceLength: number;              // N, derived by default as rows·cols·3 (min 30)
  populationSize: number;              // default 80
  maxGenerations: number;              // default 200
  crossoverRate: number;               // default 0.9
  mutationRate: number;                // default 0.3
  maxMutationsPerIndividual: number;   // default 2
  eliteCount: number;                  // default 2
  selectionMethod: "tournament" | "roulette";  // default tournament
  tournamentSize: number;              // default 3
  crossoverType: "single" | "double";  // default single
  fitness: {
    goalBase: number;                  // default 100_000
    nonGoalScale: number;              // default 99_999
    conflictTransform: "identity" | "log" | "sqrt";  // default identity
  };
  rngSeed: number;                     // default 12345
}
```

Override any subset via `GARequest.config` when posting to the worker:

```ts
worker.postMessage({
  kinds: world.toKinds(),
  mode: world.mode,
  config: { populationSize: 200, maxGenerations: 500 },
});
```

`resolveConfig` fills in the rest and derives `sequenceLength`.

---

## Integration with the UI

The GA is exposed as a **new option in the existing `SolverPanel` dropdown**,
labeled **"Genetic Algorithm"**. The panel's plumbing is unchanged;
`run()` gains one branch:

```ts
if (algo === "ga") {
  const worker = new Worker(
    new URL("../algorithm/genetic/ga.worker.ts", import.meta.url),
    { type: "module" }
  );
  workerRef.current = worker;
  worker.onmessage = (e: MessageEvent<GAResponse>) => {
    stop();
    if (e.data.type === "result") {
      setResult(gaResultToSolveResult(world, e.data.result));
      setGaHistory(e.data.result.history);
      setStatus("done");
    } else {
      setError(e.data.message);
      setStatus("error");
    }
  };
  worker.postMessage({ kinds: world.toKinds(), mode: world.mode });
  return;
}
```

`gaResultToSolveResult` reuses `algoResultToSolveResult` by constructing
the minimal `SearchResult` from the GA's `GARunResult`:

```ts
function gaResultToSolveResult(world, run): SolveResult {
  const end = run.best.result.goalStep !== null && run.best.result.goalStep >= 0
    ? run.best.result.goalStep + 1
    : run.best.sequence.length;
  return algoResultToSolveResult(world, {
    found: run.best.result.success,
    path: run.best.sequence.slice(0, end),
    totalCost: run.best.result.pathCost,
    expanded: run.generations,   // generations × populationSize would be a "fitness evaluations" count
  });
}
```

**What the user sees:**

* Same playback table: `#`, Action, Box, `s`, `s'`, Cost, Concrete,
  Total, running total.
* Same `Goal found` / `No goal` badge.
* Same step-forward/back navigation.
* **New**: a collapsible "GA generation history" table showing best
  fitness, average fitness, best conflict, best path cost, and whether
  the generation solved the puzzle.

Nothing else in the app changes. The GA is an optional algorithm,
not a replacement.

---

## Testing

`src/algorithm/genetic/ga.test.ts` covers 12 cases organized by plan step:

**Simulate (§2/§3/§3′):**
1. Truncates at first goal — `[inc×10]` with goal at 5 returns
   `goalStep = 4`, `pathCost = 5`, `minConflict = 0`.
2. Min conflict tracked over the trajectory — a sequence that *reaches*
   n=4 (conflict=1) but doesn't hit n=5 has `minConflict = 1`, not the
   endpoint's value.
3. Illegal action → `valid = false`, `success = false`.
4. `isSuccessfulPath` agrees with `simulateSequence(...).success`.

**Fitness (§4):**
5. Goal strictly outranks any non-goal.
6. Shorter goal path beats longer goal path.
7. Illegal sequence → 0.
8. Closer non-goal beats distant non-goal.

**Operators (§5):**
9. Single-point crossover preserves length and swaps tails at the cut.
10. Mutation is deterministic per seed and preserves length.

**Selection (§6):**
11. Fitter individuals selected more often under tournament.

**End-to-end:**
12. `runGeneticAlgorithm` on a toy problem (a single integer counter
    with `inc` as the only action) solves the goal, has monotone
    non-decreasing `bestFitness` in history (elitism guarantee), and
    respects the `goalBase` bound.

Run them all:

```bash
npx vitest run src/algorithm/genetic
```

The toy problem uses `GADependencies` directly (no `World`), so the
tests run in milliseconds and are independent of the rest of the app.
An integration test against `World.predefined4x2()` can be added by
providing `buildGADependencies(world)` and verifying that the returned
sequence is `valid` and its replay reaches the goal.

---

## Hyperparameter tuning

The plan specifically asks for **tunable hyperparameters**. Here's a
starting guide:

| Parameter | Default | Effect |
|---|---|---|
| `populationSize` | 80 | Larger → more diversity, slower per gen. 50–100 is fine on 4×2; 200+ for 6×6. |
| `maxGenerations` | 200 | Upper bound; solved boards usually terminate in <50 gen. |
| `sequenceLength` N | `max(30, rows·cols·3)` | Long sequences can reach any state, but search space grows. 3× board size is a good rule of thumb. |
| `crossoverRate` | 0.9 | Rate per pool pair; 0.9 means 10% of pairs skip crossover and pass through unchanged. |
| `mutationRate` | 0.3 | Rate per child; 0.3 means 30% of children are mutated. |
| `maxMutationsPerIndividual` | 2 | Max edits per mutated child. Higher = more exploration, less exploitation. |
| `eliteCount` | 2 | Copies of the best N survive unchanged. Higher = safer but slower exploration. |
| `selectionMethod` | `tournament` | Tournament is more robust when fitnesses are nearly equal. |
| `tournamentSize` | 3 | Higher = more pressure toward the best. |
| `crossoverType` | `single` | `double` explores more but disrupts good building blocks. |
| `goalBase` | 100_000 | Must exceed any realistic max `pathCost`. |
| `nonGoalScale` | 99_999 | Must be `< goalBase − max path cost`. Keeping it just below `goalBase` makes every non-goal a close second, which is good for gradient signal. |
| `conflictTransform` | `identity` | `log`/`sqrt` compress the conflict axis; try them if your non-goal fitnesses are too clustered. |
| `rngSeed` | 12345 | Change it for experiments. Tests rely on specific seeds; production should use `Date.now()`. |

**Diagnostic signals:**

* If `solved = false` after `maxGenerations`, increase
  `populationSize`, `maxMutationsPerIndividual`, or `sequenceLength`.
* If the "GA history" table shows `bestConflict` flat, you're likely
  stuck in a local optimum → raise `mutationRate` or `maxMutationsPerIndividual`.
* If `bestPathCost` is not improving across generations, elite pressure
  may be too high → lower `eliteCount` or `tournamentSize`.

---

## Known limitations

1. **No deduplication.** If two individuals happen to have the same
   sequence, they are both kept. The plan says "input to select is
   unique, but output may contain duplicates", so this is deliberate.
2. **`ActionOutcome` truthfulness.** The `gaResultToSolveResult` adapter
   replays the winning sequence through `algoResultToSolveResult` (the
   same code path as BFS/DFS/UCS), so the playback table shows
   *recomputed* costs, not the GA's internal ones. This is by design:
   the table must match what the player's `GameSession` would compute
   if they actually played the path, including concrete penalties that
   may depend on prior actions in the sequence.
3. **No opportunistic repair.** If a mutation produces a sequence with
   an illegal action at position 5, the sequence is simply marked
   `valid = false` and gets fitness 0. A more sophisticated GA could
   repair invalid sequences by re-sampling illegal positions, but this
   wasn't in the plan.
4. **No early stopping on convergence.** The GA runs until `maxGenerations`
   or until a solution is found. If `populationSize` individuals all
   converge to the same fitness, the GA still runs full iterations.
   Add a `convergenceWindow` parameter if you need this.
5. **`sequenceLength` is fixed per run.** Adaptive length (short
   sequences for easy boards, longer for hard) is not implemented.
6. **No parallel evaluation.** Each `simulateSequence` runs sequentially
   in one worker. Multiple workers could parallelize by partitioning
   the population, but this adds message-passing complexity for
   marginal gain at the current board sizes.

---

## What changed

For someone reviewing this as a pull request:

### Added

- `src/algorithm/genetic/` — 11 new files:
  - `types.ts`, `config.ts`, `random.ts`, `fitness.ts`, `simulate.ts`,
    `operators.ts`, `selection.ts`, `ga.ts`, `world-deps.ts`,
    `ga.worker.ts`, `index.ts`, `ga.test.ts`
- `GENETIC_ALGORITHM.md` — this document.

### Modified

- `src/components/SolverPanel.tsx`:
  - Added `"ga"` to `AlgoKey` and `ALGO_LABELS`.
  - Narrowed `IN_PROCESS` and `comparison` to exclude `"ga"` (it runs in
    a worker, not in-process).
  - Added a `run()` branch for `"ga"` that instantiates the GA worker.
  - Added a collapsible generation-history panel (only shown when
    `gaHistory` is non-empty).
  - Added `gaResultToSolveResult` adapter (~15 lines).

### Not modified

- `src/world/`, `src/planning/`, `src/shelves/`, `src/physics/`,
  `src/rules/`, `src/game/` — the GA treats these as read-only through
  `world-deps.ts`.
- All existing algorithms (`bfs`, `dfs`, `ucs`, `astar`, `dummy`) —
  unchanged.
- All existing tests — unchanged.
- Build configuration (`vite.config.ts`, `tsconfig.json`, `package.json`) —
  unchanged.

### Migration notes

- No configuration migration needed.
- No data migration needed.
- No API-breaking changes.
- Existing saved sessions remain valid; the GA is purely a new solver.

### Verification

```bash
npx tsc --noEmit                                # type-check
npx vitest run src/algorithm/genetic            # GA unit tests
npx vitest run                                  # full suite
npm run dev                                     # manual test in browser
```

In the browser: open the Solver panel, choose **"Genetic Algorithm"**,
click **Solve**. Expect a `Goal found` badge, a playback table, and a
"GA generation history" section.
