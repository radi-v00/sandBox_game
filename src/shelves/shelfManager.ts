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

/** Owns M horizontal and N vertical shelves. Every shelf is updated independently. */
export class ShelfManager {
  readonly horizontal: Shelf[];
  readonly vertical: Shelf[];
  readonly policies: ShelfPolicies;

  constructor(rows: number, cols: number, policies: ShelfPolicies = DEFAULT_POLICIES) {
    this.horizontal = Array.from({ length: rows }, (_, i) => new Shelf("horizontal", i));
    this.vertical = Array.from({ length: cols }, (_, i) => new Shelf("vertical", i));
    this.policies = { ...policies };
  }

  shelf(orientation: Orientation, index: number): Shelf {
    const list = orientation === "horizontal" ? this.horizontal : this.vertical;
    const shelf = list[index];
    if (!Number.isInteger(index) || shelf === undefined) {
      throw new Error(`No ${orientation} shelf with index ${index}.`);
    }
    return shelf;
  }

  private label(orientation: Orientation, index: number): string {
    return orientation === "horizontal" ? `Row ${index + 1} shelf` : `Column ${index + 1} shelf`;
  }

  pull(orientation: Orientation, index: number): ShelfCommandResult {
    const shelf = this.shelf(orientation, index);
    if (shelf.startPull()) return { ok: true, reason: `${this.label(orientation, index)} is being pulled out.` };
    return { ok: false, reason: `${this.label(orientation, index)} is already pulled out.` };
  }

  requestReturn(orientation: Orientation, index: number, world: World): ShelfCommandResult {
    const shelf = this.shelf(orientation, index);
    if (!shelf.isPulled) {
      return { ok: false, reason: `${this.label(orientation, index)} is already in place.` };
    }
    const policy = orientation === "horizontal" ? this.policies.horizontal : this.policies.vertical;
    const check = checkReturn(orientation, index, policy, world);
    if (!check.allowed) return { ok: false, reason: check.reason };
    shelf.startReturn();
    return { ok: true, reason: `${this.label(orientation, index)} is returning.` };
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
