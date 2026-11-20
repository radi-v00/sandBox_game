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

  /** Replaces the board (randomize / load example). The new board becomes the reset baseline. */
  replaceWorld(world: World): void {
    this.world = world.clone();
    this.initial = world.clone();
    this.clearProgress();
  }

  /**
   * Board editing with the sand/water/eraser tools. Editing is free (no cost) and discards the
   * action history, because a cost is only meaningful for a sequence of gate operations on an
   * untouched board. The edited board becomes the reset baseline.
   */
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
    const shelf = shelves.shelf(need.orientation, need.index);
    if (shelf.phase !== "open") {
      const label = need.orientation === "horizontal" ? `Row ${need.index + 1}` : `Column ${need.index + 1}`;
      return { ok: false, reason: `${GATE_LABELS[req.kind]} needs the ${label} shelf fully pulled out.` };
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

  reset(): void {
    this.world = this.initial.clone();
    this.clearProgress();
  }
}
