export const CONCRETE_PENALTY = 10;

const VALID_VALUES: readonly number[] = [0, 0.5, 1];

function assertValue(name: string, value: number): void {
  if (!VALID_VALUES.includes(value)) {
    throw new Error(`${name} must be one of 0, 0.5, 1 (got ${value}).`);
  }
}

export class CostModel {
  /** Action A, Top-Down Gate: 1 + 4 * (s + s'). */
  static topDownCost(sBefore: number, sAfter: number): number {
    assertValue("sBefore", sBefore);
    assertValue("sAfter", sAfter);
    return 1 + 4 * (sBefore + sAfter);
  }

  /** Action B, Side Gate: constant 1. */
  static sideGateCost(): number {
    return 1;
  }

  /** Mode B only: penalty for distinct concrete boxes, charged once per box. */
  static concretePenalty(distinctConcreteCount: number): number {
    if (!Number.isInteger(distinctConcreteCount) || distinctConcreteCount < 0) {
      throw new Error("distinctConcreteCount must be a non-negative integer.");
    }
    return CONCRETE_PENALTY * distinctConcreteCount;
  }
}
