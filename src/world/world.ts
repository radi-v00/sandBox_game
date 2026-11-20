import { type BoxKind, type Mode, assertAllowed, boxValue, hasSand, kindFromValue } from "./box";
import { mulberry32 } from "./prng";

export interface Probabilities {
  empty: number;
  halfSand: number;
  fullSand: number;
  /** Mode B only. Must be 0 or omitted in Mode A. Concrete is never generated. */
  fullWater?: number;
}

export const PREDEFINED_4X2: readonly (readonly number[])[] = [
  [1, 0],
  [0, 1],
  [0, 1],
  [1, 0],
];

export class World {
  readonly rows: number;
  readonly cols: number;
  readonly mode: Mode;
  private cells: BoxKind[];

  constructor(rows: number, cols: number, mode: Mode = "A") {
    if (!Number.isInteger(rows) || rows < 1) throw new Error("rows must be an integer >= 1.");
    if (!Number.isInteger(cols) || cols < 1) throw new Error("cols must be an integer >= 1.");
    this.rows = rows;
    this.cols = cols;
    this.mode = mode;
    this.cells = new Array<BoxKind>(rows * cols).fill("empty");
  }

  private index(row: number, col: number): number {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new Error(`Box (${row}, ${col}) is out of bounds.`);
    }
    return row * this.cols + col;
  }

  getBox(row: number, col: number): BoxKind {
    return this.cells[this.index(row, col)] as BoxKind;
  }

  setBox(row: number, col: number, kind: BoxKind): void {
    assertAllowed(kind, this.mode);
    this.cells[this.index(row, col)] = kind;
  }

  clone(): World {
    const copy = new World(this.rows, this.cols, this.mode);
    copy.cells = [...this.cells];
    return copy;
  }

  /** Goal: no box contains sand. Water and concrete boxes are allowed. */
  isGoalState(): boolean {
    return this.cells.every((kind) => !hasSand(kind));
  }

  /** Numeric box values. Water and concrete both read as 1, so use toKinds() to serialize a world. */
  toMatrix(): number[][] {
    const matrix: number[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const line: number[] = [];
      for (let c = 0; c < this.cols; c++) line.push(boxValue(this.getBox(r, c)));
      matrix.push(line);
    }
    return matrix;
  }

  toKinds(): BoxKind[][] {
    const kinds: BoxKind[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const line: BoxKind[] = [];
      for (let c = 0; c < this.cols; c++) line.push(this.getBox(r, c));
      kinds.push(line);
    }
    return kinds;
  }

  static fromKinds(kinds: readonly (readonly BoxKind[])[], mode: Mode = "A"): World {
    const rows = kinds.length;
    const cols = kinds[0]?.length ?? 0;
    const world = new World(rows, cols, mode);
    kinds.forEach((line, r) => {
      if (line.length !== cols) throw new Error("Rows must all have the same length.");
      line.forEach((kind, c) => world.setBox(r, c, kind));
    });
    return world;
  }

  static fromMatrix(matrix: readonly (readonly number[])[], mode: Mode = "A"): World {
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;
    const world = new World(rows, cols, mode);
    matrix.forEach((line, r) => {
      if (line.length !== cols) throw new Error("Matrix rows must all have the same length.");
      line.forEach((value, c) => world.setBox(r, c, kindFromValue(value)));
    });
    return world;
  }

  static predefined4x2(): World {
    return World.fromMatrix(PREDEFINED_4X2, "A");
  }

  /** Seeded random world. Never generates concrete; generates water only in Mode B. */
  static random(rows: number, cols: number, mode: Mode, seed: number, probs: Probabilities): World {
    const water = probs.fullWater ?? 0;
    if (mode === "A" && water > 0) throw new Error("Water is not allowed in Mode A.");

    const choices: { kind: BoxKind; weight: number }[] = [
      { kind: "empty", weight: probs.empty },
      { kind: "halfSand", weight: probs.halfSand },
      { kind: "fullSand", weight: probs.fullSand },
      { kind: "fullWater", weight: water },
    ];
    if (choices.some((c) => !Number.isFinite(c.weight) || c.weight < 0)) {
      throw new Error("Probabilities must be finite and non-negative.");
    }
    const total = choices.reduce((sum, c) => sum + c.weight, 0);
    if (total <= 0) throw new Error("At least one probability must be greater than 0.");
    const fallback = [...choices].reverse().find((c) => c.weight > 0)!.kind;

    const rng = mulberry32(seed);
    const world = new World(rows, cols, mode);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = rng() * total;
        let acc = 0;
        let kind = fallback;
        for (const choice of choices) {
          acc += choice.weight;
          if (x < acc) {
            kind = choice.kind;
            break;
          }
        }
        world.setBox(r, c, kind);
      }
    }
    return world;
  }
}
