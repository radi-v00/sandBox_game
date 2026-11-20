import type { BoxKind } from "../world/box";
import type { World } from "../world/world";

const CODE: Record<BoxKind, string> = {
  empty: "e",
  halfSand: "h",
  fullSand: "f",
  fullWater: "w",
  concrete: "c",
};

/** Canonical string key of a world configuration (used for the visited set). */
export function worldKey(world: World): string {
  let key = "";
  for (let r = 0; r < world.rows; r++) {
    for (let c = 0; c < world.cols; c++) key += CODE[world.getBox(r, c)];
  }
  return key;
}
