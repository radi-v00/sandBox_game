import type { World } from "../world/world";
import { checkReturn, type ReturnPolicy } from "./returnPolicy";
import { Shelf, type Orientation } from "./shelf";

export interface ShelfPolicies {
  horizontal: ReturnPolicy;
  vertical: ReturnPolicy;
}

export const DEFAULT_POLICIES: ShelfPolicies = { horizontal: "returnWhenClear", vertical: "returnWhenClear" };

export interface ShelfCommandResult {
  ok: boolean;
  reason: string;
}

/**
 * One horizontal shelf per box (the box's floor), one vertical shelf per horizontal gap
 * (the wall between (row, col) and (row, col + 1)).
 *
 * A 1x2 grid has 2 horizontal shelves and 1 vertical shelf, for 3 in total.
 * Every shelf is updated independently.
 */
export class ShelfManager {
  readonly rows: number;
  readonly cols: number;
  /** One per box, indexed r*cols + c. */
  readonly horizontal: Shelf[];
  /** One per horizontal gap, indexed r*(cols-1) + c. Empty when cols === 1. */
  readonly vertical: Shelf[];
  readonly policies: ShelfPolicies;

  constructor(rows: number, cols: number, policies: ShelfPolicies = DEFAULT_POLICIES) {
    if (!Number.isInteger(rows) || rows < 1) throw new Error("rows must be an integer >= 1.");
    if (!Number.isInteger(cols) || cols < 1) throw new Error("cols must be an integer >= 1.");
    this.rows = rows;
    this.cols = cols;

    this.horizontal = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) this.horizontal.push(new Shelf("horizontal", r, c));

    this.vertical = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols - 1; c++) this.vertical.push(new Shelf("vertical", r, c));

    this.policies = { ...policies };
  }

  shelf(orientation: Orientation, row: number, col: number): Shelf {
    if (orientation === "horizontal") {
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= this.rows || col < 0 || col >= this.cols)
        throw new Error("No horizontal shelf at box (" + row + ", " + col + ").");
      return this.horizontal[row * this.cols + col]!;
    }
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= this.rows || col < 0 || col >= this.cols - 1)
      throw new Error("No vertical shelf at gap (" + row + ", " + col + ").");
    return this.vertical[row * (this.cols - 1) + col]!;
  }

  private label(orientation: Orientation, row: number, col: number): string {
    return orientation === "horizontal"
      ? "Horizontal shelf at box (" + (row + 1) + ", " + (col + 1) + ")"
      : "Vertical shelf between (" + (row + 1) + ", " + (col + 1) + ") and (" + (row + 1) + ", " + (col + 2) + ")";
  }

  pull(orientation: Orientation, row: number, col: number): ShelfCommandResult {
    const shelf = this.shelf(orientation, row, col);
    if (shelf.startPull()) return { ok: true, reason: this.label(orientation, row, col) + " is opening." };
    return { ok: false, reason: this.label(orientation, row, col) + " is already pulled out." };
  }

  requestReturn(orientation: Orientation, row: number, col: number, world: World): ShelfCommandResult {
    const shelf = this.shelf(orientation, row, col);
    if (!shelf.isPulled) {
      return { ok: false, reason: this.label(orientation, row, col) + " is already in place." };
    }
    const policy = orientation === "horizontal" ? this.policies.horizontal : this.policies.vertical;
    const check = checkReturn(orientation, row, col, policy, world);
    if (!check.allowed) return { ok: false, reason: check.reason };
    shelf.startReturn();
    return { ok: true, reason: check.reason };
  }

  update(dtMs: number): void {
    for (const shelf of this.horizontal) shelf.update(dtMs);
    for (const shelf of this.vertical) shelf.update(dtMs);
  }

  isAnimating(): boolean {
    return this.horizontal.some((s) => s.isAnimating) || this.vertical.some((s) => s.isAnimating);
  }

  reset(): void {
    for (const shelf of this.horizontal) shelf.reset();
    for (const shelf of this.vertical) shelf.reset();
  }
}
