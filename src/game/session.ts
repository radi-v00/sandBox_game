import { requiredShelf, type GateKind } from "../rules/assumptions";
import type { ShelfManager } from "../shelves/shelfManager";
import type { BoxKind } from "../world/box";
import { applyGate, type ActionOutcome, type GateRequest } from "../world/transitions";
import type { World } from "../world/world";

export interface HistoryEntry extends ActionOutcome {
  step: number;
  kind: GateKind;
  row: number;
  col: number;
  /** Action costs plus concrete penalties up to and including this step. */
  runningTotal: number;
}

export const GATE_LABELS: Record<GateKind, string> = {
  topDown: "A: Top-Down Gate",
  sideGate: "B: Side Gate",
};

export interface ApplyResult {
  ok: boolean;
  reason: string;
}

/** One cascade step caused by gravity after an open shelf is under material. */
export interface CascadeMove {
  row: number;
  col: number;
  kindBefore: BoxKind;
  outcome: ActionOutcome;
}

/** Current world, action history and accumulated cost. Contains no React code. */
export class GameSession {
  world: World;
  history: HistoryEntry[] = [];
  actionCostTotal = 0;
  penaltyTotal = 0;
  /** Boxes that became concrete during play. Each is charged once. */
  readonly concreteBoxes = new Set<string>();
  private initial: World;

  constructor(initial: World) {
    this.initial = initial.clone();
    this.world = initial.clone();
  }

  get totalCost(): number {
    return this.actionCostTotal + this.penaltyTotal;
  }

  private clearProgress(): void {
    this.history = [];
    this.actionCostTotal = 0;
    this.penaltyTotal = 0;
    this.concreteBoxes.clear();
  }

  replaceWorld(world: World): void {
    this.world = world.clone();
    this.initial = world.clone();
    this.clearProgress();
  }

  paint(row: number, col: number, kind: BoxKind): void {
    this.world.setBox(row, col, kind);
    this.initial = this.world.clone();
    this.clearProgress();
  }

  /** Runs one gate operation. It counts as exactly one action, whatever the animation length. */
  apply(req: GateRequest, shelves: ShelfManager): ApplyResult {
    const result = applyGate(this.world, req);
    if (!result.ok) return { ok: false, reason: result.reason };

    const need = requiredShelf(req.kind, req.row, req.col);
    const shelf = shelves.shelf(need.orientation, need.row, need.col);
    if (!shelf.isPulled) {
      const label =
        need.orientation === "horizontal"
          ? `horizontal shelf at box (${need.row + 1}, ${need.col + 1})`
          : `vertical shelf between (${need.row + 1}, ${need.col + 1}) and (${need.row + 1}, ${need.col + 2})`;
      return { ok: false, reason: `${GATE_LABELS[req.kind]} needs the ${label} fully pulled out.` };
    }

    const fresh = result.outcome.newConcrete.filter((c) => !this.concreteBoxes.has(`${c.row},${c.col}`));
    fresh.forEach((c) => this.concreteBoxes.add(`${c.row},${c.col}`));
    const penalty = 10 * fresh.length;

    this.world = result.world;
    this.actionCostTotal += result.outcome.cost;
    this.penaltyTotal += penalty;
    this.history.push({
      ...result.outcome,
      concretePenalty: penalty,
      step: this.history.length + 1,
      kind: req.kind,
      row: req.row,
      col: req.col,
      runningTotal: this.totalCost,
    });
    return { ok: true, reason: result.outcome.description };
  }

  /**
   * Gravity cascade. Any box whose horizontal shelf is open cannot hold material, so its
   * content must fall into the box below (or the container). If that box's shelf is also
   * open, material passes through and continues until it rests on a closed shelf or the
   * container. Repeats until the whole board is settled.
   *
   * Cascade moves are free: no action cost is charged. Concrete penalties still apply,
   * because a sand/water contact is a real outcome of the fall.
   *
   * Returns the list of cascade moves for optional animation. The world is left settled.
   */
  settle(shelves: ShelfManager): CascadeMove[] {
    const moves: CascadeMove[] = [];
    const maxPasses = this.world.rows * this.world.cols + 1;
    for (let pass = 0; pass < maxPasses; pass++) {
      let changedThisPass = false;
      for (let r = 0; r < this.world.rows; r++) {
        for (let c = 0; c < this.world.cols; c++) {
          if (!shelves.shelf("horizontal", r, c).isPulled) continue;
          const kind = this.world.getBox(r, c);
          if (kind === "empty" || kind === "concrete") continue;

          const result = applyGate(this.world, { kind: "topDown", row: r, col: c });
          if (!result.ok || result.outcome.moved === 0) continue;

          const fresh = result.outcome.newConcrete.filter((cc) => !this.concreteBoxes.has(`${cc.row},${cc.col}`));
          fresh.forEach((cc) => this.concreteBoxes.add(`${cc.row},${cc.col}`));
          this.penaltyTotal += 10 * fresh.length;

          this.world = result.world;
          moves.push({ row: r, col: c, kindBefore: kind, outcome: result.outcome });
          changedThisPass = true;
        }
      }
      if (!changedThisPass) break;
    }
    return moves;
  }

  reset(): void {
    this.world = this.initial.clone();
    this.clearProgress();
  }
}
