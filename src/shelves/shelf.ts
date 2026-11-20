export type Orientation = "horizontal" | "vertical";
export type ShelfPhase = "closed" | "opening" | "open" | "closing";

export const SHELF_ANIMATION_MS = 400;

/**
 * One shelf. progress 0 = in place, progress 1 = fully pulled out.
 * A shelf knows nothing about the other shelves, so shelves can never lock each other.
 *
 * Horizontal shelves are the floor of one box, at (row, col).
 * Vertical shelves are the wall between (row, col) and (row, col + 1).
 */
export class Shelf {
  readonly orientation: Orientation;
  readonly row: number;
  readonly col: number;
  private _phase: ShelfPhase = "closed";
  private _progress = 0;

  constructor(orientation: Orientation, row: number, col: number) {
    this.orientation = orientation;
    this.row = row;
    this.col = col;
  }

  get phase(): ShelfPhase {
    return this._phase;
  }

  get progress(): number {
    return this._progress;
  }

  /** True while the shelf is pulled out or moving out. */
  get isPulled(): boolean {
    return this._phase === "open" || this._phase === "opening";
  }

  get isAnimating(): boolean {
    return this._phase === "opening" || this._phase === "closing";
  }

  /** Starts pulling. Allowed from closed and closing (reverses the motion). Returns false otherwise. */
  startPull(): boolean {
    if (this._phase === "closed" || this._phase === "closing") {
      this._phase = "opening";
      return true;
    }
    return false;
  }

  /** Starts returning. Allowed from open and opening. Returns false otherwise. */
  startReturn(): boolean {
    if (this._phase === "open" || this._phase === "opening") {
      this._phase = "closing";
      return true;
    }
    return false;
  }

  update(dtMs: number): void {
    const delta = dtMs / SHELF_ANIMATION_MS;
    if (this._phase === "opening") {
      this._progress = Math.min(1, this._progress + delta);
      if (this._progress >= 1) this._phase = "open";
    } else if (this._phase === "closing") {
      this._progress = Math.max(0, this._progress - delta);
      if (this._progress <= 0) this._phase = "closed";
    }
  }

  reset(): void {
    this._phase = "closed";
    this._progress = 0;
  }
}
