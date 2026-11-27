# Design Decisions — Seven-Step Walkthrough

This document answers, step by step, the seven steps from the assignment
and states what we chose, what alternatives we rejected, and why. It is
meant to be read **before** `GENETIC_ALGORITHM.md` (which is the
reference manual for the code).

## Preliminaries

The repo is `shelf-world-web`: a React/TypeScript puzzle sandbox where a
`World` holds a 2-D grid of boxes of kind
`empty | halfSand | fullSand | fullWater | concrete`. Two gate actions
(`topDown`, `sideGate`) transition the world, and the goal is
`World.isGoalState() === true`, i.e. **no box contains sand**. Cost is
computed by `CostModel` — `topDown = 1 + 4(s + s')`, `sideGate = 1`,
`concretePenalty = 10 · n`. For full details see `README.md`.

The GA is added in `src/algorithm/genetic/` and runs in a Web Worker
(`ga.worker.ts`). It is selected from the same `SolverPanel` dropdown as
UCS / BFS / DFS / A*.

---

## Step 1 — Problem definition

**Chosen:** the **sandbox path-finding** problem, using the existing
simulator and cost model.

**Alternatives considered:**

- **Rubik cube** (mentioned in the plan as an illustrative example).
  Rejected as the *primary* problem because: (a) it does not exist in
  this repo, (b) it would require a second `World`-like class, (c) the
  sandbox already has a non-trivial cost model that makes the GA
  interesting.
- **15-puzzle, sliding-puzzle, gridworld**. Rejected for the same
  reason — they would need a separate simulator.
- **Falling-sand continuous simulation**. Rejected because the physics
  layer in `src/physics/` is cosmetic only; the actual state transition
  is the discrete `applyGate`.

**Why sandbox:** it satisfies the plan's premise (a state-transition
graph with a well-defined goal), has a **state-dependent cost model**
(so path-cost matters), supports **Mode A / Mode B** (so we can show
the heuristic behaves in both), and already ships with **two
independent UCS implementations** (`planning/solver.ts` for the
worker-UCS, `algorithm/ucs.ts` for in-process) that can serve as the
optimal baseline in the benchmark.

**Code anchor:** `src/world/`, `src/planning/costModel.ts`.

---

## Step 2 — Sequence-of-actions state representation

**Chosen:** each individual is a `Sequence = GateRequest[]` of fixed
length `N`, replayed from `initialWorld`. The replay **truncates at the
first goal**.

**Alternatives considered:**

- *Variable-length sequences.* Would require length-penalized fitness or
  padding schemes, and would make crossover messy (children of
  different lengths).
- *Variable-length with BFS-style bounded DFS.* That's not GA
  anymore — that's best-first search with repair.
- *BFS-history encoding* (state = list of ancestors). Equivalent to a
  fixed-length sequence but with more bookkeeping.

**Why fixed length:** it is the encoding assumed by the plan; it makes
single/double-point crossover trivially well-defined; it removes the
"sequence can be arbitrarily long" pathological case; and it lets us
reason about the search space as a hypercube of dimension `N`.

**Why truncate at first goal:** the plan states this explicitly. It also
makes the path cost well-defined (only actions up to the goal are
charged).

**N default:** `max(30, rows · cols · 3)` — implemented in
`config.ts::resolveConfig`. For a 4×2 board, `N = 30`. For a 5×3 board,
`N = 45`. Rationale: `rows · cols · 3` is a rough upper bound on the
longest minimal solution — each cell might need up to ~3 gate actions
to clear. The `max(30, …)` floor matches the plan's lower bound.

**Code anchor:** `src/algorithm/genetic/simulate.ts::simulateSequence`.

---

## Step 3 — Goal test on a path

**Chosen:** `isSuccessfulPath(sequence, deps): boolean` — takes a
sequence, replays it, and returns whether the goal was reached at any
prefix.

**Alternatives considered:**

- *Reuse `isGoal(world)` on the final world only.* Rejected: the plan
  explicitly asks for a *path* goal test, and only checking the final
  world would miss goals that were reached mid-sequence.

**Why a separate function:** the plan asks for `Path_Goal_Test` or
`Successful_Path_Test` explicitly. It is also useful as a standalone
predicate for experiments and tests independent of the fitness
function.

**Code anchor:** `src/algorithm/genetic/simulate.ts::isSuccessfulPath`.

---

## Step 3' — Conflict number (heuristic)

**Chosen:** `sandBoxCount(world)` from `src/world/stats.ts` — the
number of boxes that still contain sand. Minimized over the trajectory.

**Alternatives considered:**

- *`remainingSand(world)`* — finer granularity (0.5 steps for half
  boxes). Rejected as the default because the finer signal does not
  help on the `sandBoxCount`-based goal test (a box with 0.5 sand is
  still "not a goal"), and it makes fitness values less interpretable.
  Available as a one-line swap in `world-deps.ts`.
- *Mixed `sandBoxCount + concreteCount`.* Concrete boxes are
  **allowed** by `isGoalState`, so counting them as conflict would
  make some goals score `> 0`. Rejected.
- *Distance-to-nearest-goal from UCS.* Circular — we want the heuristic
  to *approximate* this distance without running UCS.

**Why `sandBoxCount`:** it is exactly `0` iff `isGoalState()` (verified
against `world.ts::isGoalState`), integer-valued (so the fitness
landscape is flat within each "n boxes remaining" plateau — good for
tournament selection), and cheap (O(rows·cols)).

**Why min-over-trajectory, not endpoint:** the plan says so
explicitly. Rationale: a sequence might reach a good state at step 12
and then ruin it by step 30. The "closest reached state" is the more
informative signal for the GA. Endpoint would over-reward "hovering" at
the goal region and under-reward "reaching then passing through".

**Code anchor:** `src/algorithm/genetic/simulate.ts` (tracking),
`src/algorithm/genetic/world-deps.ts::buildGADependencies` (definition).

---

## Step 4 — Fitness / value function

**Chosen:**

```
if illegal:        0
if goal:           goalBase − pathCost
otherwise:         nonGoalScale / (1 + f(minConflict))
```

with `goalBase = 100_000`, `nonGoalScale = 99_999`,
`f ∈ {identity, log1p, sqrt}`, default `identity`.

**Alternatives considered from the plan:**

- `Fitness = LARGE − conflict − cost` (plan's simple form). Rejected
  because it can go negative when `conflict + cost > LARGE`, which
  breaks tournament selection assumptions.
- `Fitness = LARGE − w1·f(conflict) − w2·g(cost)` (plan's extended
  form). Rejected because it introduces two extra hyperparameters
  (`w1`, `w2`) that need tuning, for no measurable benefit at this
  scale. The division form has a mathematically stronger guarantee
  (see below) and one fewer knob.

**Why the division form (guaranteed dominance):**

- For non-goals, `minConflict >= 1` (by definition of "not a goal"), so
  `nonGoal_fitness <= nonGoalScale / 2 ≈ 50_000`.
- For goals, `pathCost` is at most a few hundred in the worst case
  (each `topDown` costs at most 9; 40 steps × 9 = 360; plus 10 per
  concrete box), so `goal_fitness >= 100_000 − 500 = 99_500`.
- Therefore: **every goal strictly outranks every non-goal**, regardless
  of how close the non-goal got.

**Why `identity` transform:** `sandBoxCount <= rows · cols` is a small
integer, so `log1p` and `sqrt` would flatten the gradient near zero,
making the "distance to goal" axis indistinguishable for the top
individuals. `identity` preserves the natural ordering. `log1p` and
`sqrt` remain available as config flags for experimentation.

**Numeric choice proof:** the maximum feasible `pathCost` on a 4×2
board is `N × 9 + N_concrete × 10 <= 30 × 9 + 30 × 10 = 570`. With
`goalBase = 100_000` and `nonGoalScale = 99_999`, the gap is
`100_000 − 99_999/2 ≈ 50_000`, which comfortably exceeds `570`. So
dominance is safe.

**Code anchor:** `src/algorithm/genetic/fitness.ts::fitnessOf`.

---

## Step 5 — Genetic operators

### Mutation

**Chosen:** `mutate(seq, actionPool, rng, maxMutations)` — stochastic,
`1..maxMutations` edits per call, each edit either replaces a gene
with a random `GateRequest` from `actionPool` or swaps two genes.

**Alternatives considered from the plan:**

- *Reverse-between-two-positions.* Rejected as the default because it
  assumes permutation-like semantics; the action sequence is not a
  permutation, so reversing a segment is not a meaningful small step.
  (Available to add later if a particular problem wants it.)
- *Deterministic mutation.* Rejected explicitly by the plan.

**Illegal-action policy:** an individual whose sequence hits an illegal
`applyGate` during replay gets fitness 0 but **remains in the
population** — it does not get removed by mutation itself. The
selection + elitism pipeline will naturally kill it off. This is
cleaner than doing "repair" inside mutation because (a) it keeps
mutation simple and testable, (b) the plan says "fitness = 0" for
lethal mutations, not "replace immediately".

**Code anchor:** `src/algorithm/genetic/operators.ts::mutate`.

### Crossover

**Chosen:** `crossover(p1, p2, type, rng)` — two parents → two children,
`type ∈ {"single", "double"}`, default `"single"`.

**Alternatives considered:**

- *Only single-point* (plan's primary suggestion). Implemented, and set
  as default for simplicity.
- *Only double-point* (plan's secondary suggestion). Implemented as a
  config flag.
- *Uniform crossover* (per-gene random parent). Not implemented because
  it is less common in the plan's framing and would add another test
  surface without a clear benefit at this board size.

**Why two parents → two children:** classic GA; keeps population size
constant with `ceil(popSize / 2)` pairings. The plan asks for this
explicitly.

**Code anchor:** `src/algorithm/genetic/operators.ts::crossover`.

---

## Step 6 — GA driver

**Chosen:** elitism = top `eliteCount` (default 2) copied unchanged;
main loop:

```
evaluate → record stats → copy elites →
select pool → crossover pool in pairs → mutate each child →
evaluate new population → check solved
```

**Alternatives considered:**

- *No elitism.* Rejected — the best solution can be lost due to
  crossover/mutation, which makes the "best-in-generation" curve
  non-monotone and the benchmark unstable.
- *High elitism (e.g., 10).* Rejected — slows exploration, especially
  when the initial population has many low-fitness individuals.
- *Steady-state GA* (one child at a time). Rejected — harder to
  implement reproducibly and not required by the plan.

**Re-apply from initial world each generation:** mandatory for
comparable fitness. Enforced by `simulateSequence` cloning
`initialWorld` on each call — it never mutates the original.

**Stopping criterion:** `solved === true` (goal found) OR
`generation === maxGenerations`.

**Code anchor:** `src/algorithm/genetic/ga.ts::runGeneticAlgorithm`.

---

## Step 7 — Selection

**Chosen:** `select(population, fitnesses, size, cfg, rng)` —
tournament (`k = cfg.tournamentSize = 3` by default) **or** roulette,
configurable. Output has length `size = populationSize − eliteCount`
and may contain duplicates of input individuals.

**Alternatives considered:**

- *Only tournament.* My default, because it is robust to near-equal
  fitness values (which happen here: many non-goals cluster around
  `nonGoalScale / (1 + minConflict)`). Tournament with `k = 3` gives
  moderate pressure.
- *Only roulette.* Available, but struggles when fitnesses are nearly
  equal — the "wheel" becomes effectively uniform.
- *Rank selection.* Not implemented — plan asks for tournament or
  roulette.

**Output contract:** the pool is a list of length
`populationSize − eliteCount`, consumed by the crossover loop as
consecutive pairs `(pool[0], pool[1])`, `(pool[2], pool[3])`, ... The
pool **may contain duplicates** — this is the plan's "mating pool"
concept.

**Why `select` calls `fitnessOf` internally:** it does not — the driver
computes fitnesses once per generation, passes them in, and `select`
only consumes the array. This keeps `select` decoupled from
`GADependencies` and makes it testable with plain numbers.

**Code anchor:** `src/algorithm/genetic/selection.ts::select`.

---

## Cross-cutting decisions

### Determinism

The GA uses a seeded mulberry32 RNG. The same `rngSeed` produces the
same population and the same result. This is **required** for the
benchmark to be reproducible. Each problem in the benchmark uses a
distinct `rngSeed` (derived from `baseSeed + gaSeedOffset + i`) so the
GA does not accidentally overfit to one specific random trajectory.

### Dependency injection

The GA core never imports `World`, `applyGate`, or `CostModel`. It
depends on the `GADependencies` interface. The sandbox implementation
is `world-deps.ts`. A future Rubik implementation would be a sibling
file in a hypothetical `src/rubik/` folder. This makes every GA module
testable with stubs and satisfies the plan's "start from the sandbox
but do not limit to it" framing.

### Worker

The GA runs in a Web Worker (`ga.worker.ts`) with the same message
convention as `planning/solver.worker.ts` —
`{ type: "result", result } | { type: "error", message }`. This keeps
the UI responsive on large boards, exactly like the existing
`worker-ucs`.

### Model agreement with the UCS baseline

The GA models the world as a **bare `World`** — it calls `applyGate`
directly, ignoring shelf state and cascade. The UCS baseline
(`planning/solver.ts::solve`) uses `problem.ts::successors`, which per
the project's own documentation "ignores shelf state — treats every
action as always available". **Both algorithms therefore model the
same simplified problem**, and the benchmark comparison is fair. If
you ever want a version that respects shelves, extend both sides
together — do not change only one.
