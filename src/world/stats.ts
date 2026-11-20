import { boxValue, hasSand } from "./box";
import type { World } from "./world";

/** Total sand in the world, in box units (a full box counts 1, a half box 0.5). */
export function remainingSand(world: World): number {
  let total = 0;
  for (let r = 0; r < world.rows; r++) {
    for (let c = 0; c < world.cols; c++) {
      const kind = world.getBox(r, c);
      if (hasSand(kind)) total += boxValue(kind);
    }
  }
  return total;
}

export function sandBoxCount(world: World): number {
  let count = 0;
  for (let r = 0; r < world.rows; r++) {
    for (let c = 0; c < world.cols; c++) if (hasSand(world.getBox(r, c))) count++;
  }
  return count;
}

export function concreteCount(world: World): number {
  let count = 0;
  for (let r = 0; r < world.rows; r++) {
    for (let c = 0; c < world.cols; c++) if (world.getBox(r, c) === "concrete") count++;
  }
  return count;
}
