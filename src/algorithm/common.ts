import { World } from "../world/world";
import { boxValue, materialOf } from "../world/box";
import { applyGate } from "../world/transitions";

export type Action =
  | { kind: "topDown";  row: number; col: number }
  | { kind: "sideGate"; row: number; col: number };

export interface SearchState {
  world: World;
  openShelves: Set<string>; // "topDown:r:c"
}

export interface Child { state: SearchState; action: Action; cost: number }

export interface SearchResult {
  found: boolean;
  path: Action[];
  totalCost: number;
  expanded: number;
}

// ---------- hash ----------
// toKinds() keeps water (value 1) and fullSand (value 1) distinct.
export function hash(s: SearchState): string {
  const w = JSON.stringify(s.world.toKinds());
  const o = [...s.openShelves].sort().join(",");
  return `${w}|${o}`;
}

// ---------- goal ----------
export function isGoal(s: SearchState): boolean {
  return s.world.isGoalState(); // no sand; water/concrete allowed
}

// ---------- initial ----------
export function initialFrom(world: World): SearchState {
  return { world: world.clone(), openShelves: new Set() };
}

// ---------- feasibility ----------
export function isTopDownFeasible(s: SearchState, r: number, c: number): boolean {
  if (s.openShelves.has(`topDown:${r}:${c}`)) return false;
  const kind = s.world.getBox(r, c);
  return kind !== "concrete" && kind !== "empty";
}

export function isSideGateFeasible(s: SearchState, r: number, c: number): boolean {
  const src = s.world.getBox(r, c);
  if (materialOf(src) !== "sand") return false;    // applyGate throws on water
  if (c + 1 >= s.world.cols) return false;         // no right neighbour
  if (s.world.getBox(r, c + 1) === "concrete") return false;
  return true;
}

// ---------- transition ----------
export function step(s: SearchState, action: Action): Child | null {
  // ---- side gate ----
  if (action.kind === "sideGate") {
    const res = applyGate(s.world, { kind: "sideGate", row: action.row, col: action.col });
    if (!res.ok) return null;
    if (res.outcome.moved === 0 && res.outcome.newConcrete.length === 0) return null;

    const open = new Set(s.openShelves);
    for (const k of [...open]) {
      const [, rs, cs] = k.split(":");
      if (res.world.getBox(+rs, +cs) === "empty") open.delete(k);
    }
    return {
      state: { world: res.world, openShelves: open },
      action,
      cost: 1 + res.outcome.concretePenalty,
    };
  }

  // ---- top-down with cascade + reconciliation ----
  let w = s.world.clone();
  const open = new Set(s.openShelves);
  const key = `topDown:${action.row}:${action.col}`;
  const sBefore = boxValue(w.getBox(action.row, action.col));
  open.add(key);

  let concretePenalty = 0;

  const first = applyGate(w, { kind: "topDown", row: action.row, col: action.col });
  if (!first.ok) return null;
  w = first.world;
  concretePenalty += first.outcome.concretePenalty;
  if (w.getBox(action.row, action.col) === "empty") open.delete(key);

  const maxPasses = w.rows * w.cols + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const k of [...open]) {
      const [, rs, cs] = k.split(":");
      const rr = +rs, cc = +cs;
      const kind = w.getBox(rr, cc);
      if (kind === "empty")     { open.delete(k); continue; }
      if (kind === "concrete")  { continue; }
      const res = applyGate(w, { kind: "topDown", row: rr, col: cc });
      if (res.ok && res.outcome.moved > 0) {
        w = res.world;
        concretePenalty += res.outcome.concretePenalty;
        changed = true;
      }
      if (w.getBox(rr, cc) === "empty") open.delete(k);
    }
    if (!changed) break;
  }

  // Reconcile: s' is the box value AFTER cascade + auto-close.
  const sAfter = boxValue(w.getBox(action.row, action.col));
  const actionCost = 1 + 4 * (sBefore + sAfter);
  return {
    state: { world: w, openShelves: open },
    action,
    cost: actionCost + concretePenalty,
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

// ---------- MinHeap (unchanged from existing file) ----------
export class MinHeap<T> {
  private a: T[] = [];
  constructor(private less: (x: T, y: T) => boolean) {}
  size(): number { return this.a.length; }
  peek(): T | undefined { return this.a[0]; }
  push(x: T): void {
    this.a.push(x);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(this.a[i], this.a[p])) {
        [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
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
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < n && this.less(this.a[l], this.a[m])) m = l;
        if (r < n && this.less(this.a[r], this.a[m])) m = r;
        if (m === i) break;
        [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
        i = m;
      }
    }
    return top;
  }
}