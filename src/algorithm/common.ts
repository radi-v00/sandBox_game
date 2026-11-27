import { World } from "../world/world";
import { boxValue } from "../world/box";
import { applyGate } from "../world/transitions";

export type Action =
  | { kind: "topDown"; row: number; col: number }
  | { kind: "sideGate"; row: number; col: number };

export interface SearchState {
  world: World;
  openShelves: Set<string>; // "topDown:r:c"
}

export interface Child {
  state: SearchState;
  action: Action;
  cost: number;
}

export interface SearchResult {
  found: boolean;
  path: Action[];
  totalCost: number;
  expanded: number;
}

// ---------- hash ----------
// toKinds() distinguishes fullWater from fullSand (both value 1 in toMatrix()).
export function hash(s: SearchState): string {
  const w = JSON.stringify(s.world.toKinds());
  const o = [...s.openShelves].sort().join(",");
  return `${w}|${o}`;
}

// ---------- goal ----------
export function isGoal(s: SearchState): boolean {
  return s.world.isGoalState();
}

// ---------- initial ----------
export function initialFrom(world: World): SearchState {
  return { world: world.clone(), openShelves: new Set() };
}

// ---------- feasibility ----------
export function isTopDownFeasible(
  s: SearchState,
  r: number,
  c: number,
): boolean {
  if (s.openShelves.has(`topDown:${r}:${c}`)) return false;
  const kind = s.world.getBox(r, c);
  return kind !== "concrete" && kind !== "empty";
}

export function isSideGateFeasible(
  s: SearchState,
  r: number,
  c: number,
): boolean {
  if (c < 0 || c + 1 >= s.world.cols) return false;
  const left = s.world.getBox(r, c);
  const right = s.world.getBox(r, c + 1);
  // Exactly one side full sand, the other empty — either orientation.
  return (
    (left === "fullSand" && right === "empty") ||
    (left === "empty" && right === "fullSand")
  );
}

// ---------- cascade: iterate to fixpoint, no auto-close during ----------
function cascade(
  w: World,
  open: Set<string>,
): { world: World; penalty: number } {
  let cur = w;
  let penalty = 0;
  const maxPasses = cur.rows * cur.cols + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const k of [...open]) {
      const [, rs, cs] = k.split(":");
      if (rs === undefined || cs === undefined) continue;
      const rr = +rs,
        cc = +cs;
      const kind = cur.getBox(rr, cc);
      if (kind === "empty" || kind === "concrete") continue;
      const res = applyGate(cur, { kind: "topDown", row: rr, col: cc });
      if (res.ok && res.outcome.moved > 0) {
        cur = res.world;
        penalty += res.outcome.concretePenalty;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { world: cur, penalty };
}

// ---------- auto-close: run AFTER cascade, matching the game's frame loop ----------
function autoClose(w: World, open: Set<string>): void {
  for (const k of [...open]) {
    const [, rs, cs] = k.split(":");

    if (rs === undefined || cs === undefined) continue;
    if (w.getBox(+rs, +cs) === "empty") open.delete(k);
  }
}

// ---------- single transition ----------
export function step(s: SearchState, action: Action): Child | null {
  // ============ SIDE GATE ============
  if (action.kind === "sideGate") {
    const res = applyGate(s.world, {
      kind: "sideGate",
      row: action.row,
      col: action.col,
    });
    if (!res.ok || res.outcome.moved === 0) return null;

    let w = res.world;
    let penalty = res.outcome.concretePenalty;
    const open = new Set(s.openShelves);
    const c = cascade(w, open);
    w = c.world;
    penalty += c.penalty;
    autoClose(w, open);

    return {
      state: { world: w, openShelves: open },
      action,
      cost: 1 + penalty,
    };
  }

  // ============ TOP-DOWN ============
  const { row, col } = action;
  const sBefore = boxValue(s.world.getBox(row, col));
  const open = new Set(s.openShelves);
  open.add(`topDown:${row}:${col}`);

  let w = s.world.clone();
  let penalty = 0;

  const first = applyGate(w, { kind: "topDown", row, col });
  if (!first.ok) return null;
  w = first.world;
  penalty += first.outcome.concretePenalty;

  // Cascade first (game's settle), then auto-close (game's frame loop).
  const c = cascade(w, open);
  w = c.world;
  penalty += c.penalty;
  autoClose(w, open);

  // Reconcile s' from the settled box, matching session.recomputeLastAction.
  const sAfter = boxValue(w.getBox(row, col));
  const actionCost = 1 + 4 * (sBefore + sAfter);
  return {
    state: { world: w, openShelves: open },
    action,
    cost: actionCost + penalty,
  };
}

// ---------- successors ----------
export function successors(s: SearchState): Child[] {
  const out: Child[] = [];
  for (let r = 0; r < s.world.rows; r++) {
    for (let c = 0; c < s.world.cols; c++) {
      if (isTopDownFeasible(s, r, c)) {
        const ch = step(s, { kind: "topDown", row: r, col: c });
        if (ch) out.push(ch);
      }
      if (isSideGateFeasible(s, r, c)) {
        const ch = step(s, { kind: "sideGate", row: r, col: c });
        if (ch) out.push(ch);
      }
    }
  }
  return out;
}

// ---------- MinHeap (unchanged) ----------
export class MinHeap<T> {
  private a: T[] = [];
  constructor(private less: (x: T, y: T) => boolean) {}
  size(): number {
    return this.a.length;
  }
  peek(): T | undefined {
    return this.a[0];
  }
  push(x: T): void {
    this.a.push(x);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const child = this.a[i];
      const parent = this.a[p];
      if (
        child !== undefined &&
        parent !== undefined &&
        this.less(child, parent)
      ) {
        [this.a[i], this.a[p]] = [parent, child];
        i = p;
      } else break;
    }
  }
  pop(): T | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      let i = 0;
      const n = this.a.length;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        const left = this.a[l];
        const current = this.a[m];
        if (
          l < n &&
          left !== undefined &&
          current !== undefined &&
          this.less(left, current)
        )
          m = l;
        const right = this.a[r];
        const smallest = this.a[m];
        if (
          r < n &&
          right !== undefined &&
          smallest !== undefined &&
          this.less(right, smallest)
        )
          m = r;
        if (m === i) break;
        const tmp = this.a[i]!;
        this.a[i] = this.a[m]!;
        this.a[m] = tmp;
        i = m;
      }
    }
    return top;
  }
}
