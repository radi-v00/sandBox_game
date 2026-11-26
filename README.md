# shelf-world-web

A browser-based puzzle sandbox built with **React + TypeScript + Vite**.
The player manipulates a grid of boxes (sand, water, concrete) using two gate
actions and tries to reach a state with **no sand left in any box**. The app
ships with six search/solver algorithms — BFS, DFS, UCS, A*, a baseline
"Dummy", and a **Genetic Algorithm** — with an interactive playback viewer.

> Live goal: `World.isGoalState() === true` ⇔ *no box contains sand*.
> Water and concrete may remain; empty and container-full boxes are fine.

---

## Table of contents

1. [Overview](#overview)
2. [Features](#features)
3. [Quick start](#quick-start)
4. [How the game works](#how-the-game-works)
5. [Search algorithms](#search-algorithms)
6. [Cost model](#cost-model)
7. [Project structure](#project-structure)
8. [Testing](#testing)
9. [Conventions](#conventions)
10. [Extending the project](#extending-the-project)
11. [Credits](#credits)

---

## Overview

`shelf-world-web` is a small, deterministic sandbox. The world is a **grid of
boxes**, each holding one of five kinds:

| Kind        | Sand value | Notes                                |
|-------------|-----------:|--------------------------------------|
| `empty`     | 0          | nothing inside                       |
| `halfSand`  | 0.5        | sand                                 |
| `fullSand`  | 1          | sand                                 |
| `fullWater` | 1 (water)  | Mode B only                          |
| `concrete`  | –          | immovable; blocks its box forever    |

The player interacts with the world through two **gate actions**:

* **A — Top-Down Gate** (`topDown`): flushes box `(row, col)` into the box
  directly below, or into the bottom container if it is the last row.
* **B — Side Gate** (`sideGate`): transfers `0.5` from one `fullSand` box
  to an adjacent `empty` box in the same row.

The **goal** is to remove all sand. There are two modes:

* **Mode A** — sand only. The goal is reachable purely by pouring down.
* **Mode B** — sand + water + concrete. When sand meets water in the same
  box, that box becomes **concrete** (an irreversible step) and incurs a
  cost penalty.

A **shelf** must be *pulled* before its corresponding gate can be used.
Visual particle animation is cosmetic only — the actual state transition is
`applyGate` in `src/world/transitions.ts`.

The app also ships a **solver panel** that runs several search algorithms
(BFS, DFS, UCS, A*, and now a Genetic Algorithm) and lets you **step through
any solution** — the whole board is replayed at each step, with a table of
`sBefore`, `sAfter`, per-step cost, and running total.

---

## Features

- **Deterministic world model** — no hidden state; everything lives in `World`.
- **Single transition function** — `applyGate` is the only place a state
  changes, used identically by the UI, the planner, and the GA.
- **Two game modes** — sand only (A), and sand + water + concrete (B).
- **Shelf mechanic** — each gate requires its shelf to be *pulled* first.
- **Six solvers** — Dummy, BFS, DFS, UCS (in-process), UCS (Web Worker), A*,
  and a Genetic Algorithm (Web Worker).
- **Interactive playback** — step forward/back through any found solution,
  with the board replayed live and a table of per-step costs.
- **Unified cost model** — `CostModel` provides `topDownCost(s, s') = 1 + 4(s + s')`,
  `sideGateCost() = 1`, and `concretePenalty(n) = 10·n`.
- **Full test suite** — Vitest covering world, transitions, shelves, physics,
  planning, and the algorithms (including the GA).
- **Web Worker support** — heavy searches run off the main thread.

---

## Quick start

```bash
# install
npm install

# dev server
npm run dev

# production build
npm run build

# preview a production build
npm run preview

# run all tests
npm test
# or specific module
npx vitest run src/algorithm/genetic
```

Requires **Node 18+**. The project was developed against the versions
pinned in `package-lock.json` (React 18.3, Vite 5.4, Vitest 2.0).

---

## How the game works

### State

A `World` (`src/world/world.ts`) is:

```ts
class World {
  readonly rows: number;
  readonly cols: number;
  readonly mode: "A" | "B";
  // private BoxKind[] cells

  getBox(r: number, c: number): BoxKind;
  setBox(r: number, c: number, kind: BoxKind): void;
  clone(): World;
  isGoalState(): boolean;      // ⇔ every cell has !hasSand(kind)
  toMatrix(): number[][];      // sand/water values only
  toKinds(): BoxKind[][];      // full serialization
  static fromKinds(kinds, mode): World;
  static fromMatrix(matrix, mode): World;
  static predefined4x2(): World;
  static random(rows, cols, mode, seed, probs): World;
}
```

The state is fully described by the `cells` array plus `rows / cols / mode`.
`clone()` is the standard way to get a copy — `applyGate` always clones
before mutating, so callers never observe side effects.

### Actions

```ts
interface GateRequest {
  kind: "topDown" | "sideGate";
  row: number;
  col: number;
}
```

### Transition

```ts
type TransitionResult =
  | { ok: true; world: World; outcome: ActionOutcome }
  | { ok: false; reason: string };

applyGate(world: World, req: GateRequest): TransitionResult
```

`ActionOutcome` carries everything you need to score a step:

```ts
interface ActionOutcome {
  sBefore: number;          // source box value before
  sAfter: number | null;    // source box value after (null for sideGate)
  cost: number;             // CostModel.topDownCost | sideGateCost
  moved: number;            // amount that left the source box
  removed: number;          // amount that left the world (bottom container)
  newConcrete: Coord[];     // boxes that became concrete in this step
  concretePenalty: number;  // = 10 × newConcrete.length
  description: string;
}
```

`applyGate` is **pure**: `world` is never mutated.

### Shelves

A `ShelfManager` (`src/shelves/shelfManager.ts`) tracks which **shelves**
have been pulled out. Each `GateRequest` requires a specific shelf
(`requiredShelf(kind, row, col)`); if it isn't fully pulled, `session.apply`
returns an error. The *search algorithms ignore shelves* — they treat all
actions as available — since a solution only needs to demonstrate a legal
state sequence, not the player's interleaved shelf-pulling.

### Session

`GameSession` (`src/game/session.ts`) is the non-React, mutable game state:

```ts
class GameSession {
  world: World;
  history: HistoryEntry[];
  actionCostTotal: number;
  penaltyTotal: number;
  readonly concreteBoxes: Set<string>;

  paint(row, col, kind): void;               // edit a cell, reset history
  apply(req, shelves): ApplyResult;          // execute a gate
  recomputeLastAction(row, col): void;       // topDown: recompute after cascades
  settle(shelves): CascadeMove[];            // let gravity pull sand down
  reset(): void;
}
```

History entries carry `step, kind, row, col, runningTotal` on top of
`ActionOutcome`, so a solved game is fully replayable.

---

## Search algorithms

All algorithms live in `src/algorithm/` and follow the same interface:

```ts
interface SearchResult {
  found: boolean;
  path: Action[];       // Action is GateRequest
  totalCost: number;
  expanded: number;
}

type Algorithm = (initial: SearchState) => SearchResult;
```

`SearchState` is `{ world: World; openShelves: Set<string> }` (from
`src/algorithm/common.ts`). The *bare-World* planner in `src/planning/`
ignores shelves (see `planning/problem.ts::successors`); the UI-facing
`algorithm/*` module respects them.

### Available algorithms

| Key           | Name                          | Best for                        |
|---------------|-------------------------------|---------------------------------|
| `worker-ucs`  | UCS (Web Worker)              | Large boards                    |
| `dummy`       | Dummy baseline                | Sanity-check the harness        |
| `bfs`         | Breadth-First Search          | Minimum *number of actions*     |
| `dfs`         | Depth-First Search            | Any solution, small boards      |
| `algo-ucs`    | UCS (in-process)              | Small boards, no worker overhead|
| `astar`       | A* (currently h = 0, = UCS)   | Extendable via a heuristic      |
| `ga`          | Genetic Algorithm             | Large boards, no optimality guarantee |

> **UCS vs. BFS.** UCS minimizes *cost* (using `CostModel`); BFS minimizes
> *number of actions*. In this game a `topDown` on a full box costs `9`,
> so BFS can return a 3-step path that UCS finds a 2-step path for. Use
> UCS if you care about cost; BFS if you care about step count.

### Genetic Algorithm

The GA is described in detail in [`GENETIC_ALGORITHM.md`](./GENETIC_ALGORITHM.md).
In short: each individual is a fixed-length `Sequence = GateRequest[]`;
fitness is `goalBase − pathCost` for goals and `nonGoalScale / (1 + f(minConflict))`
for non-goals; operators are single- or double-point crossover and
replace/swap mutation; selection is tournament (k=3, configurable) or
roulette. It runs in a Web Worker like `worker-ucs`.

---

## Cost model

Centralized in `src/planning/costModel.ts`:

```ts
CostModel.topDownCost(sBefore, sAfter) = 1 + 4 * (sBefore + sAfter)
CostModel.sideGateCost()              = 1
CostModel.concretePenalty(n)          = 10 * n        // distinct new concrete boxes
```

`sBefore` and `sAfter` are **the source box's value**, before and after
the flush. Valid sand values are `{0, 0.5, 1}`; anything else throws.

Concrete penalties are **not part of** `topDownCost` — they are tracked
separately in `ActionOutcome.concretePenalty` and added by the caller.
This separation is important because concrete is charged *once per box*
(`GameSession.concreteBoxes` is a `Set`), not once per action that touches it.

---

## Project structure

```
.
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── GENETIC_ALGORITHM.md         ← this document
└── src
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    │
    ├── algorithm/                # Search algorithms (single interface)
    │   ├── common.ts             #   SearchState, initialFrom, step, hash, ...
    │   ├── dummy.ts              #   Baseline "returns nothing"
    │   ├── bfs.ts
    │   ├── dfs.ts
    │   ├── ucs.ts
    │   ├── astar.ts
    │   ├── index.ts
    │   └── genetic/              # ← GA (see GENETIC_ALGORITHM.md)
    │       ├── types.ts
    │       ├── config.ts
    │       ├── random.ts
    │       ├── fitness.ts
    │       ├── simulate.ts
    │       ├── operators.ts
    │       ├── selection.ts
    │       ├── ga.ts
    │       ├── world-deps.ts     # Bridge: World → GADependencies
    │       ├── ga.worker.ts
    │       ├── index.ts
    │       └── ga.test.ts
    │
    ├── planning/                 # Bare-World planner (used by worker-UCS)
    │   ├── state.ts
    │   ├── problem.ts
    │   ├── actions.ts
    │   ├── costModel.ts          #   CostModel (the single source of truth)
    │   ├── heap.ts
    │   ├── solver.ts
    │   ├── solver.worker.ts
    │   └── *.test.ts
    │
    ├── world/                    # World model, transitions, box helpers
    │   ├── world.ts              #   World class
    │   ├── box.ts                #   BoxKind, hasSand, boxValue, kindOf, ...
    │   ├── transitions.ts        #   applyGate (the single transition)
    │   ├── stats.ts              #   remainingSand, sandBoxCount, concreteCount
    │   ├── prng.ts               #   mulberry32
    │   └── *.test.ts
    │
    ├── shelves/                  # Shelf mechanics
    │   ├── shelf.ts
    │   ├── shelfManager.ts
    │   ├── returnPolicy.ts
    │   └── *.test.ts
    │
    ├── physics/                  # Particle animation (cosmetic)
    │   ├── particleEngine.ts
    │   ├── materials.ts
    │   └── *.test.ts
    │
    ├── rules/                    # Gate/shelf/mode rules
    │   ├── assumptions.ts
    │   └── assumptions.test.ts
    │
    ├── game/                     # GameSession (mutable, non-React state)
    │   ├── session.ts
    │   └── *.test.ts
    │
    ├── components/               # React UI
    │   ├── ConfigScreen.tsx
    │   ├── SimulationScreen.tsx
    │   ├── SolverPanel.tsx       #   Dropdown of algorithms + playback
    │   ├── WorldCanvas.tsx       #   Board rendering
    │   ├── ParticleCanvas.tsx    #   Cosmetic particles
    │   ├── ShelfControls.tsx
    │   └── HistoryTable.tsx
    │
    └── algorithm/
        └── common.ts             #   Shared SearchState helpers
```

---

## Testing

The project uses **Vitest**:

```bash
npx vitest run                 # one-shot
npx vitest                     # watch mode
npx vitest --ui                # Vitest UI
npx vitest run src/algorithm/genetic   # just the GA
```

Test files live next to their source (`*.test.ts`). Coverage currently
spans:

- **`src/world/`** — World construction, cloning, goal detection, stats,
  PRNG, transitions (`Mode B` concrete formation).
- **`src/rules/`** — Gate/shelf/material compatibility.
- **`src/shelves/`** — Shelf manager, return policy, concrete return.
- **`src/physics/`** — Particle engine, materials, pouring.
- **`src/planning/`** — Heap, cost model, solver, action costs.
- **`src/algorithm/genetic/`** — All building blocks + end-to-end
  solve on a toy problem.
- **`src/game/`** — Session apply, recompute-after-cascade, settle.
- **`tests/`** — Algorithm integration (UCS cascade, algorithm module
  contract).

---

## Conventions

- **No mutation of `World` in transition functions.** `applyGate` clones.
- **Cost rules only in `CostModel`.** Never inline `1 + 4 * (s + s')`.
- **The single transition function is `applyGate`.** Do not
  duplicate state-transition logic in a new algorithm.
- **Actions are `GateRequest`.** Do not invent a new action type.
- **The bare-World planner ignores shelves.** Do not add shelf state to
  `planning/`; shelves belong to the *player* layer in `algorithm/common.ts`
  and `game/session.ts`.
- **Serialization is `toKinds()`, not `toMatrix()`.** Water and concrete
  both read as `1` in `toMatrix()` and are therefore lossy.
- **Heavy work goes in a Worker.** See `solver.worker.ts` and `ga.worker.ts`
  for the convention (`{ type: "result", ... } | { type: "error", message }`).
- **Default constructor errors should be clear.** Public constructors throw
  with descriptive messages on invalid arguments (see `CostModel`).

---

## Extending the project

**Add a new search algorithm.**
Create `src/algorithm/yourAlgo.ts` exporting `(initial: SearchState) => SearchResult`.
Add it to `IN_PROCESS` in `SolverPanel.tsx` and to `ALGO_LABELS`. If it's
expensive, wrap it in a Worker modeled on `ga.worker.ts`.

**Add a new mode.** Modes live in `src/world/box.ts` (`Mode = "A" | "B"`)
and are enforced by `assertAllowed`. `World` and `applyGate` are already
parameterized on `mode`; add cells, update `hasSand` and `isGoalState` as
needed, and extend the tests.

**Add a new gate.** A gate is a `GateKind` (in `src/rules/assumptions.ts`)
plus a `topDown`/`sideGate`-style function in `transitions.ts`. Follow the
pattern: pure function, returns `TransitionResult`, populates `ActionOutcome`.

**Add a new heuristic for A\*.** Replace `astar.ts`'s `h = 0` with
something like `sandBoxCount(world)` (admissible when one action can
remove at most one box, which it can in this game).

---

## Credits

Built as a teaching/demo project for **AI search**, **heuristics**,
**metaheuristics (GA)**, and **clean state-machine design**. The GA
implementation follows the plan documented in
[`GENETIC_ALGORITHM.md`](./GENETIC_ALGORITHM.md).
