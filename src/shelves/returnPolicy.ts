import { materialOf } from "../world/box";
import type { World } from "../world/world";
import type { Orientation } from "./shelf";

export type ReturnPolicy = "returnWhenClear" | "alwaysAllow" | "neverAllow";

export const RETURN_POLICIES: readonly ReturnPolicy[] = ["returnWhenClear", "alwaysAllow", "neverAllow"];

export interface ReturnCheck {
  allowed: boolean;
  reason: string;
}

/** A box blocks the return only when it holds movable material. Concrete is permanent and never blocks. */
function boxHasMaterial(world: World, row: number, col: number): boolean {
  if (row < 0 || row >= world.rows || col < 0 || col >= world.cols) return false;
  return materialOf(world.getBox(row, col)) !== null;
}

/**
 * Decides whether a shelf may return.
 *
 * returnWhenClear:
 *   Horizontal shelf at (r, c): needs box (r - 1, c) clear. Row 0 is always clear.
 *   Vertical shelf at (r, c): always clear (a vertical shelf closes with no content check).
 *
 * neverAllow / alwaysAllow ignore the world.
 * Concrete never blocks, because materialOf returns null for it.
 */
export function checkReturn(
  orientation: Orientation,
  row: number,
  col: number,
  policy: ReturnPolicy,
  world: World,
): ReturnCheck {
  const label =
    orientation === "horizontal"
      ? "Horizontal shelf at box (" + (row + 1) + ", " + (col + 1) + ")"
      : "Vertical shelf between (" + (row + 1) + ", " + (col + 1) + ") and (" + (row + 1) + ", " + (col + 2) + ")";

  if (policy === "alwaysAllow") return { allowed: true, reason: label + " may return (policy: always allow)." };
  if (policy === "neverAllow") return { allowed: false, reason: label + " cannot return (policy: never allow)." };

  // returnWhenClear
  if (orientation === "vertical") {
    return { allowed: true, reason: label + " may return (vertical shelves always return)." };
  }
  if (row === 0) {
    return { allowed: true, reason: label + " may return (top row is always clear)." };
  }
  if (boxHasMaterial(world, row - 1, col)) {
    return {
      allowed: false,
      reason: label + " cannot return: box (" + row + ", " + (col + 1) + ") still contains material.",
    };
  }
  return { allowed: true, reason: label + " may return (box above is clear)." };
}
