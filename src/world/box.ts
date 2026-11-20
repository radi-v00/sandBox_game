import { modeBBoxValue } from "../rules/assumptions";

export type Mode = "A" | "B";
export type BoxKind = "empty" | "halfSand" | "fullSand" | "fullWater" | "concrete";
export type BoxValue = 0 | 0.5 | 1;
export type Material = "sand" | "water";

const MODE_A_KINDS: readonly BoxKind[] = ["empty", "halfSand", "fullSand"];
const MODE_B_KINDS: readonly BoxKind[] = ["empty", "halfSand", "fullSand", "fullWater", "concrete"];

export function allowedKinds(mode: Mode): readonly BoxKind[] {
  return mode === "A" ? MODE_A_KINDS : MODE_B_KINDS;
}

export function isAllowedInMode(kind: BoxKind, mode: Mode): boolean {
  return allowedKinds(mode).includes(kind);
}

/** Throws if the kind is not permitted in the given mode (for example water in Mode A). */
export function assertAllowed(kind: BoxKind, mode: Mode): void {
  if (!isAllowedInMode(kind, mode)) {
    throw new Error(`Box state "${kind}" is not allowed in Mode ${mode}.`);
  }
}

/** Numeric value s in {0, 0.5, 1} used by the cost model. */
export function boxValue(kind: BoxKind): BoxValue {
  switch (kind) {
    case "empty":
      return 0;
    case "halfSand":
      return 0.5;
    case "fullSand":
      return 1;
    case "fullWater":
    case "concrete":
      return modeBBoxValue(kind);
  }
}

export function kindFromValue(value: number): BoxKind {
  if (value === 0) return "empty";
  if (value === 0.5) return "halfSand";
  if (value === 1) return "fullSand";
  throw new Error(`Invalid box value ${value}; expected 0, 0.5 or 1.`);
}

export function hasSand(kind: BoxKind): boolean {
  return kind === "halfSand" || kind === "fullSand";
}

export function materialOf(kind: BoxKind): Material | null {
  if (kind === "halfSand" || kind === "fullSand") return "sand";
  if (kind === "fullWater") return "water";
  return null;
}

/** Box kind holding `value` of a material. Water exists only as a full box. */
export function kindOf(material: Material, value: number): BoxKind {
  if (value === 0) return "empty";
  if (material === "sand") return kindFromValue(value);
  if (value === 1) return "fullWater";
  throw new Error(`Water exists only as a full box (got ${value}).`);
}
