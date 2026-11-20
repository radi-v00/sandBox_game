import { precedingLine } from "../rules/assumptions";
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
function lineHasMaterial(world: World, orientation: Orientation, line: number): boolean {
  if (orientation === "horizontal") {
    for (let c = 0; c < world.cols; c++) if (materialOf(world.getBox(line, c)) !== null) return true;
  } else {
    for (let r = 0; r < world.rows; r++) if (materialOf(world.getBox(r, line)) !== null) return true;
  }
  return false;
}

/**
 * Decides whether a shelf may return.
 * returnWhenClear: horizontal shelf in row r needs row r-1 clear; vertical shelf in column c needs column c-1 clear.
 * Row 0 and column 0 are always clear.
 */
export function checkReturn(
  orientation: Orientation,
  index: number,
  policy: ReturnPolicy,
  world: World,
): ReturnCheck {
  const label = orientation === "horizontal" ? `Row ${index + 1} shelf` : `Column ${index + 1} shelf`;
  const lineName = orientation === "horizontal" ? "row" : "column";

  if (policy === "alwaysAllow") return { allowed: true, reason: `${label} may return (policy: always allow).` };
  if (policy === "neverAllow") return { allowed: false, reason: `${label} cannot return (policy: never allow).` };

  const prev = precedingLine(index);
  if (prev === null) return { allowed: true, reason: `${label} may return (first ${lineName} is considered clear).` };
  if (lineHasMaterial(world, orientation, prev)) {
    return { allowed: false, reason: `${label} cannot return: ${lineName} ${prev + 1} still contains material.` };
  }
  return { allowed: true, reason: `${label} may return (${lineName} ${prev + 1} is clear).` };
}
