import { CostModel } from "../planning/costModel";
import {
  WATER_USES_SIDE_GATE,
  flushTarget,
  isMovable,
  sideContactAmount,
  sideTargetCol,
  sideTransferAmount,
  topDownContactAmount,
  transferAmount,
  type GateKind,
} from "../rules/assumptions";
import { boxValue, kindOf, materialOf } from "./box";
import type { World } from "./world";

export interface GateRequest {
  kind: GateKind;
  row: number;
  col: number;
}

export interface Coord {
  row: number;
  col: number;
}

export interface ActionOutcome {
  /** Value of the upper (source) box before the action. */
  sBefore: number;
  /** Value of the same box after the action. Only defined for Action A. */
  sAfter: number | null;
  /** Action cost only. The concrete penalty is kept separately in concretePenalty. */
  cost: number;
  /** Amount moved out of the source box. */
  moved: number;
  /** Amount that left the world through the bottom container. */
  removed: number;
  /** Boxes that became concrete in this action. */
  newConcrete: Coord[];
  /** 10 per box in newConcrete. Mode B only; always 0 in Mode A. */
  concretePenalty: number;
  description: string;
}

export type TransitionResult =
  | { ok: true; world: World; outcome: ActionOutcome }
  | { ok: false; reason: string };

const fail = (reason: string): TransitionResult => ({ ok: false, reason });
const name = (row: number, col: number) => `(${row + 1}, ${col + 1})`;

function describe(
  row: number,
  col: number,
  moved: number,
  where: string,
  newConcrete: Coord[],
): string {
  const base =
    moved === 0
      ? `Nothing moved from box ${name(row, col)}.`
      : `Moved ${moved} from box ${name(row, col)} to ${where}.`;
  const concrete = newConcrete
    .map((c) => ` Box ${name(c.row, c.col)} became concrete.`)
    .join("");
  return base + concrete;
}

/**
 * The single transition function. The UI and the planner both use it.
 * Pure: the input world is never modified.
 */
export function applyGate(world: World, req: GateRequest): TransitionResult {
  const { row, col } = req;
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    row >= world.rows ||
    col < 0 ||
    col >= world.cols
  ) {
    return fail(`Box (${row}, ${col}) is out of bounds.`);
  }
  return req.kind === "topDown"
    ? topDown(world, row, col)
    : sideGate(world, row, col);
}

function topDown(world: World, row: number, col: number): TransitionResult {
  const upper = world.getBox(row, col);
  if (!isMovable(upper))
    return fail(`Box ${name(row, col)} is concrete and cannot be flushed.`);

  const sBefore = boxValue(upper);
  const material = materialOf(upper);
  const target = flushTarget(row, col, world.rows);
  const next = world.clone();
  const newConcrete: Coord[] = [];
  let moved = 0;
  let removed = 0;
  let where = "nowhere";

  if (material !== null) {
    if (target === "container") {
      where = "the container";
      moved = sBefore;
      removed = sBefore;
      next.setBox(row, col, "empty");
    } else {
      where = `box ${name(target.row, target.col)}`;
      const lower = world.getBox(target.row, target.col);
      const lowerMaterial = materialOf(lower);
      if (lower === "concrete") {
        moved = 0; // concrete blocks its box permanently
      } else if (lowerMaterial !== null && lowerMaterial !== material) {
        // sand meets water: the lower box becomes concrete (rules O6, O10)
        moved = topDownContactAmount(sBefore);
        next.setBox(row, col, kindOf(material, sBefore - moved));
        next.setBox(target.row, target.col, "concrete");
        newConcrete.push({ row: target.row, col: target.col });
      } else {
        const lowerValue = boxValue(lower);
        moved = transferAmount(sBefore, lowerValue);
        if (moved > 0) {
          next.setBox(row, col, kindOf(material, sBefore - moved));
          next.setBox(
            target.row,
            target.col,
            kindOf(material, lowerValue + moved),
          );
        }
      }
    }
  }

  // s' is measured on the executed result, not predicted.
  const sAfter = boxValue(next.getBox(row, col));
  console.log(sAfter);
  return {
    ok: true,
    world: next,
    outcome: {
      sBefore,
      sAfter,
      cost: CostModel.topDownCost(sBefore, sAfter),
      moved,
      removed,
      newConcrete,
      concretePenalty: CostModel.concretePenalty(newConcrete.length),
      description: describe(row, col, moved, where, newConcrete),
    },
  };
}

function sideGate(world: World, row: number, col: number): TransitionResult {
  if (col < 0 || col + 1 >= world.cols)
    return fail(`No side gate at box ${name(row, col)}.`);

  const left = world.getBox(row, col);
  const right = world.getBox(row, col + 1);

  let sourceCol: number;
  if (left === "fullSand" && right === "empty") {
    sourceCol = col;
  } else if (left === "empty" && right === "fullSand") {
    sourceCol = col + 1;
  } else {
    return fail(
      `Side gate ${name(row, col)} needs one full-sand side and one empty side.`,
    );
  }

  const targetCol = sourceCol === col ? col + 1 : col;
  const next = world.clone();
  next.setBox(row, sourceCol, "halfSand");
  next.setBox(row, targetCol, "halfSand");

  return {
    ok: true,
    world: next,
    outcome: {
      sBefore: 1,
      sAfter: null,
      cost: CostModel.sideGateCost(),
      moved: 0.5,
      removed: 0,
      newConcrete: [],
      concretePenalty: 0,
      description: `Side gate ${name(row, col)} moved 0.5 from ${name(row, sourceCol)} to ${name(row, targetCol)}.`,
    },
  };
}
