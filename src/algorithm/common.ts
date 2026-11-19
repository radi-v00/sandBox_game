import { World } from "../world/world";
import { boxValue } from "../world/box";
import { applyGate } from "../world/transitions";

export type Action =
  | { kind: "topDown"; row: number; col: number }
  | { kind: "side";    row: number; col: number };

export interface SearchState {
  world: World;
  openShelves: Set<string>;   // "topDown:r:c"
}

export interface Child { state: SearchState; action: Action; cost: number }

export interface SearchResult {
  found: boolean;
  path: Action[];
  totalCost: number;
  expanded: number;
}

const SIDE_SHARE = 0.5;
const EPSILON = 1e-9;

// ---------- hash ----------
export function hash(s: SearchState): string {
  const w = JSON.stringify(s.world.toMatrix());
  const o = [...s.openShelves].sort().join(",");
  return `${w}|${o}`;
}

// ---------- goal ----------
export function isGoal(s: SearchState): boolean {
  return s.world.toMatrix().every(row => row.every(b => b.kind !== "sand"));
}

// ---------- initial ----------
export function initialFrom(world: World): SearchState {
  return { world: world.clone(), openShelves: new Set() };
}

// ---------- feasibility (Q3) ----------
export function isTopDownFeasible(s: SearchState, r: number, c: number): boolean {
  if (s.openShelves.has(`topDown:${r}:${c}`)) return false;
  const src = s.world.getBox(r, c);
  if (src.kind === "empty" || src.kind === "concrete") return false;
  return true;
}

export function isSideFeasible(s: SearchState, r: number, c: number): boolean {
  if (c === 0 || c === s.world.cols - 1) return false;        // Q2: no edge gates
  const src = s.world.getBox(r, c);
  if (src.kind === "empty" || src.kind === "concrete") return false;

  const left  = s.world.getBox(r, c - 1);
  const right = s.world.getBox(r, c + 1);
  const emptyCount = (left.kind === "empty" ? 1 : 0) + (right.kind === "empty" ? 1 : 0);
  if (emptyCount === 0) return false;
  return src.value + EPSILON >= SIDE_SHARE * emptyCount;      // 1/2 each
}

// ---------- defensive wrapper over applyGate ----------
function applyTopDown(w: World, row: number, col: number) {
  const res = applyGate(w, { kind: "topDown", row, col }) as any;
  const world: World = res && res.next ? res.next : w;
  const outcome = res && res.outcome
    ? res.outcome
    : { moved: 0, sBefore: 0, sAfter: 0, cost: 0, concretePenalty: 0 };
  return { world, outcome };
}

// ---------- single transition ----------
export function step(s: SearchState, action: Action): Child {
  // ============ SIDE GATE ============
  if (action.kind === "side") {
    const w = s.world.clone();
    const open = new Set(s.openShelves);
    const { row, col } = action;
    const src   = w.getBox(row, col);
    const left  = w.getBox(row, col - 1);
    const right = w.getBox(row, col + 1);
    const empties = [left, right].filter(b => b.kind === "empty");

    for (const nb of empties) { nb.kind = src.kind; nb.value = SIDE_SHARE; }
    src.value -= SIDE_SHARE * empties.length;
    if (src.value <= EPSILON) { src.kind = "empty"; src.value = 0; }

    // maintain invariant: no open shelf sits above an empty box
    for (const k of [...open]) {
      const [, rs, cs] = k.split(":");
      if (w.getBox(+rs, +cs).kind === "empty") open.delete(k);
    }
    return { state: { world: w, openShelves: open }, action, cost: 1 };
  }

  // ============ TOP-DOWN SHELF ============
  let w = s.world.clone();
  const open = new Set(s.openShelves);
  const { row, col } = action;
  const key = `topDown:${row}:${col}`;
  const sBefore = boxValue(w.getBox(row, col));
  open.add(key);

  let concretePenalty = 0;

  // immediate transfer
  {
    const { world, outcome } = applyTopDown(w, row, col);
    w = world;
    concretePenalty += outcome.concretePenalty ?? 0;
  }
  if (w.getBox(row, col).kind === "empty") open.delete(key);

  // cascade to fixpoint
  const maxPasses = w.rows * w.cols + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const k of [...open]) {
      const [, rs, cs] = k.split(":");
      const rr = +rs, cc = +cs;
      if (w.getBox(rr, cc).kind === "empty") { open.delete(k); continue; }

      const { world, outcome } = applyTopDown(w, rr, cc);
      if (outcome.moved > 0) {
        w = world;
        concretePenalty += outcome.concretePenalty ?? 0;
        changed = true;
      }
      if (w.getBox(rr, cc).kind === "empty") open.delete(k);
    }
    if (!changed) break;
  }

  // RECONCILE - s' is the final box after cascade + auto-close
  const sAfter = boxValue(w.getBox(row, col));
  const actionCost = 1 + 4 * (sBefore + sAfter);

  return { state: { world: w, openShelves: open }, action, cost: actionCost + concretePenalty };
}

// ---------- successors ----------
export function successors(s: SearchState): Child[] {
  const out: Child[] = [];
  for (let r = 0; r < s.world.rows; r++) {
    for (let c = 0; c < s.world.cols; c++) {
      if (isTopDownFeasible(s, r, c)) out.push(step(s, { kind: "topDown", row: r, col: c }));
      if (isSideFeasible(s, r, c))    out.push(step(s, { kind: "side",    row: r, col: c }));
    }
  }
  return out;
}

// ---------- MinHeap (used by ucs / astar) ----------
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
