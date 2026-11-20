/**
 * Open rules. Each one is isolated here so it can be changed without touching the rest of the project.
 * A "flush" is the top-down gate (Action A). The "side gate" is Action B.
 */
import type { BoxKind, BoxValue } from "../world/box";
import type { Orientation } from "../shelves/shelf";

export type FlushTarget = { row: number; col: number } | "container";

/** O1. Action A on box (row, col) flushes into box (row + 1, col); the last row flushes into the container. */
export function flushTarget(row: number, col: number, rows: number): FlushTarget {
  return row + 1 < rows ? { row: row + 1, col } : "container";
}

/** O2. Top-down transfer amount when there is no contact. Keeps values in {0, 0.5, 1}. */
export function transferAmount(upperValue: number, lowerValue: number): number {
  return Math.min(upperValue, 1 - lowerValue);
}

/** O3. Side gate direction. */
export type SideDirection = "right" | "left" | "both";
export const SIDE_GATE_DIRECTION: SideDirection = "right";

/** Largest amount the side gate may take out: at least half stays, in steps of 0.5. */
export function sideMaxMove(sourceValue: number): number {
  return Math.floor((sourceValue - sourceValue / 2) / 0.5) * 0.5;
}

/** O3b. Side gate amount, limited by the free space in the target. */
export function sideTransferAmount(sourceValue: number, targetValue: number): number {
  return Math.min(sideMaxMove(sourceValue), 1 - targetValue);
}

/** O3c. Target column of the side gate, or null when there is no neighbour in the configured direction. */
export function sideTargetCol(col: number, cols: number): number | null {
  if (SIDE_GATE_DIRECTION === "right") return col + 1 < cols ? col + 1 : null;
  if (SIDE_GATE_DIRECTION === "left") return col > 0 ? col - 1 : null;
  throw new Error('Side gate direction "both" is not implemented.');
}

/** O4. Preceding row/column used by the "return when clear" policy. null means "considered clear". */
export function precedingLine(index: number): number | null {
  return index > 0 ? index - 1 : null;
}

/**
 * O6. Amount consumed by concrete on contact; capacity is ignored because the target is full of the
 * other material. Top-down: the whole content of the upper box. Side gate: the normal side maximum.
 */
export function topDownContactAmount(upperValue: number): number {
  return upperValue;
}
export function sideContactAmount(sourceValue: number): number {
  return sideMaxMove(sourceValue);
}

/** O7. Numeric cost value s of a water or concrete box. Decided: 1. */
export function modeBBoxValue(_kind: "fullWater" | "concrete"): BoxValue {
  return 1;
}

/** O8. Concrete never moves. It cannot be flushed, pushed or reopened. */
export function isMovable(kind: BoxKind): boolean {
  return kind !== "concrete";
}

/** O9. Which shelf must be fully pulled out before a gate operation can run. */
export type GateKind = "topDown" | "sideGate";
export function requiredShelf(
  kind: GateKind,
  row: number,
  col: number,
): { orientation: Orientation; row: number; col: number } {
  // Horizontal shelves are the floor of one box, at (row, col).
  // Vertical shelves are the wall between (row, col) and (row, col + 1), so col must be < cols - 1.
  return kind === "topDown"
    ? { orientation: "horizontal", row, col }
    : { orientation: "vertical", row, col };
}

/** O11. Water cannot be split, so it never moves sideways. */
export const WATER_USES_SIDE_GATE = false;
