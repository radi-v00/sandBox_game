import type { BoxKind } from "../world/box";

/** Numeric particle ids. Plain numbers so the engine can move to C/WASM later. */
export const P_EMPTY = 0;
export const P_SAND = 1;
export const P_WATER = 2;
export const P_CONCRETE = 3;

/** Particle id that represents a box state (one material per box, water is full only). */
export function particleOf(kind: BoxKind): number {
  switch (kind) {
    case "empty":
      return P_EMPTY;
    case "halfSand":
    case "fullSand":
      return P_SAND;
    case "fullWater":
      return P_WATER;
    case "concrete":
      return P_CONCRETE;
  }
}

/** How many particles a box state occupies out of `total` particles per box. */
export function particleCount(kind: BoxKind, total: number): number {
  switch (kind) {
    case "empty":
      return 0;
    case "halfSand":
      return total / 2;
    case "fullSand":
    case "fullWater":
    case "concrete":
      return total;
  }
}

/**
 * Snap particle counts back to the allowed box states. This is the explicit conversion the spec asks
 * for: no logical state outside {empty, halfSand, fullSand, fullWater, concrete} is ever produced.
 */
export function boxKindFor(sand: number, water: number, concrete: number, total: number): BoxKind {
  if (concrete > 0) return "concrete";
  if (sand > 0 && water > 0) return "concrete"; // sand/water contact, rule O6
  if (water > 0) return "fullWater";
  if (sand >= total * 0.75) return "fullSand";
  if (sand >= total * 0.25) return "halfSand";
  return "empty";
}
