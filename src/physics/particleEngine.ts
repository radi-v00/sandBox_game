import type { BoxKind } from "../world/box";
import type { World } from "../world/world";
import { P_CONCRETE, P_EMPTY, P_SAND, P_WATER, boxKindFor, particleCount, particleOf } from "./materials";

export const DEFAULT_RESOLUTION = 8;
/** Ticks a freshly formed concrete box is shown as a sand/water mixture before it sets. */
export const REACTION_TICKS = 10;
/** Ticks a poured particle spends in flight (after its own delay). */
export const POUR_TICKS = 14;
/** Extra ticks spread across the poured particles, so they leave as a stream, not all at once. */
export const POUR_SPREAD_TICKS = 6;

export interface PourSource {
  row: number;
  col: number;
}

export interface FlyingParticle {
  /** Grid coordinates; fractional and possibly outside any box while crossing a gap. */
  r: number;
  c: number;
  id: number;
}

interface InFlight {
  id: number;
  sr: number;
  sc: number;
  er: number;
  ec: number;
  delay: number;
  duration: number;
  age: number;
  /** Target box; -1 means the container (the particle is discarded on landing). */
  targetRow: number;
  targetCol: number;
}

/**
 * Presentation-only particle grid. It is seeded from the authoritative box states, settles particles
 * inside each box, animates gate pours between boxes, and can only report back states that are allowed
 * by the spec. Pure TypeScript: no React and no DOM.
 */
export class ParticleEngine {
  readonly boxRows: number;
  readonly boxCols: number;
  /** Particles per box side. Even, so a half box is a whole number of particles. */
  readonly res: number;
  readonly gridRows: number;
  readonly gridCols: number;

  private readonly grid: Uint8Array;
  private readonly solidified = new Set<string>();
  private readonly reacting = new Map<string, number>();
  private inFlight: InFlight[] = [];
  private parity = 0;
  private movesThisTick = 0;

  constructor(boxRows: number, boxCols: number, res: number = DEFAULT_RESOLUTION) {
    if (!Number.isInteger(boxRows) || boxRows < 1) throw new Error("boxRows must be an integer >= 1.");
    if (!Number.isInteger(boxCols) || boxCols < 1) throw new Error("boxCols must be an integer >= 1.");
    if (!Number.isInteger(res) || res < 2 || res % 2 !== 0) throw new Error("res must be an even integer >= 2.");
    this.boxRows = boxRows;
    this.boxCols = boxCols;
    this.res = res;
    this.gridRows = boxRows * res;
    this.gridCols = boxCols * res;
    this.grid = new Uint8Array(this.gridRows * this.gridCols);
  }

  get particlesPerBox(): number {
    return this.res * this.res;
  }

  /** Particle id at a grid cell (0 = empty). */
  at(row: number, col: number): number {
    return this.grid[row * this.gridCols + col] ?? P_EMPTY;
  }

  /** Particles currently crossing between boxes, at their interpolated positions. */
  flyingParticles(): FlyingParticle[] {
    return this.inFlight.map((p) => {
      const progress = p.age <= p.delay ? 0 : Math.min(1, (p.age - p.delay) / p.duration);
      const ease = progress * progress; // slow start, fast finish: looks like falling material
      return {
        id: p.id,
        r: p.sr + (p.er - p.sr) * ease,
        c: p.sc + (p.ec - p.sc) * ease,
      };
    });
  }

  /**
   * Seeds the grid from a world. Particles fill the top of each box and settle over the next ticks,
   * which makes a gate operation look like poured material. A concrete box is first shown as a
   * sand/water mixture, so the layer visibly forms concrete. Any in-progress pour is cancelled.
   */
  loadFromWorld(world: World): void {
    if (world.rows !== this.boxRows || world.cols !== this.boxCols) {
      throw new Error("World dimensions do not match this engine.");
    }
    this.grid.fill(P_EMPTY);
    this.inFlight = [];
    const total = this.particlesPerBox;
    for (let br = 0; br < this.boxRows; br++) {
      for (let bc = 0; bc < this.boxCols; bc++) {
        const kind = world.getBox(br, bc);
        const key = `${br},${bc}`;
        if (kind === "concrete" && !this.solidified.has(key)) {
          this.seedMixture(br, bc, total);
          this.reacting.set(key, REACTION_TICKS);
        } else {
          this.fillFromTop(br, bc, particleOf(kind), particleCount(kind, total));
        }
      }
    }
  }

  /** Clears the grid and forgets which boxes were solidified. Use on reset or a new board. */
  reset(): void {
    this.grid.fill(P_EMPTY);
    this.solidified.clear();
    this.reacting.clear();
    this.inFlight = [];
    this.parity = 0;
  }

  /**
   * Starts a pour of `count` particles of `id` from a source box towards a target box (or null for the
   * container). Must match the box transition: take exactly the amount that moved, so the box model stays
   * authoritative. The source cells are cleared immediately; particles appear in flight.
   */
  playPour(params: {
    source: PourSource;
    target: PourSource | null;
    id: number;
    count: number;
    duration?: number;
    spread?: number;
  }): void {
    const { source, id } = params;
    const count = Math.max(0, Math.min(Math.floor(params.count), this.particlesPerBox));
    if (count === 0) return;
    const duration = params.duration ?? POUR_TICKS;
    const spread = params.spread ?? POUR_SPREAD_TICKS;

    // Take the topmost `count` particles of that id out of the source box.
    const starts: { r: number; c: number }[] = [];
    for (let r = 0; r < this.res && starts.length < count; r++) {
      for (let c = 0; c < this.res && starts.length < count; c++) {
        const idx = this.cell(source.row, source.col, r, c);
        if (this.grid[idx] === id) {
          starts.push({ r: source.row * this.res + r, c: source.col * this.res + c });
          this.grid[idx] = P_EMPTY;
        }
      }
    }

    const targetRow = params.target ? params.target.row : -1;
    const targetCol = params.target ? params.target.col : -1;

    starts.forEach((s, i) => {
      let er: number;
      let ec: number;
      if (targetRow >= 0) {
        const lr = Math.floor(i / this.res);
        const lc = i % this.res;
        er = targetRow * this.res + lr + 0.5;
        ec = targetCol * this.res + lc + 0.5;
      } else {
        er = this.gridRows + 4; // off the bottom, into the container
        ec = source.col * this.res + this.res / 2;
      }
      this.inFlight.push({
        id,
        sr: s.r + 0.5,
        sc: s.c + 0.5,
        er,
        ec,
        delay: (i / starts.length) * spread,
        duration,
        age: 0,
        targetRow,
        targetCol,
      });
    });
  }

  /** One fixed tick. Advance pours, then reactions, then settle sand and water; each particle moves once. */
  step(): boolean {
    this.parity ^= 1;
    this.movesThisTick = 0;
    const pouring = this.advancePour();
    this.tickReactions();
    const movedTo = new Uint8Array(this.grid.length);
    this.settle(P_SAND, movedTo, false);
    this.settle(P_WATER, movedTo, true);
    return pouring || this.movesThisTick > 0;
  }

  /** Lossless report back in the allowed box states. Particles in flight count towards their target box. */
  toBoxKinds(): BoxKind[][] {
    const total = this.particlesPerBox;
    const n = this.boxRows * this.boxCols;
    const sand = new Int32Array(n);
    const water = new Int32Array(n);
    const concrete = new Int32Array(n);

    for (let br = 0; br < this.boxRows; br++) {
      for (let bc = 0; bc < this.boxCols; bc++) {
        const k = br * this.boxCols + bc;
        for (let r = 0; r < this.res; r++) {
          for (let c = 0; c < this.res; c++) {
            const id = this.grid[this.cell(br, bc, r, c)] ?? P_EMPTY;
            if (id === P_SAND) sand[k] = (sand[k] ?? 0) + 1;
            else if (id === P_WATER) water[k] = (water[k] ?? 0) + 1;
            else if (id === P_CONCRETE) concrete[k] = (concrete[k] ?? 0) + 1;
          }
        }
      }
    }

    for (const p of this.inFlight) {
      if (p.targetRow < 0) continue;
      const k = p.targetRow * this.boxCols + p.targetCol;
      if (p.id === P_SAND) sand[k] = (sand[k] ?? 0) + 1;
      else if (p.id === P_WATER) water[k] = (water[k] ?? 0) + 1;
      else if (p.id === P_CONCRETE) concrete[k] = (concrete[k] ?? 0) + 1;
    }

    const out: BoxKind[][] = [];
    for (let br = 0; br < this.boxRows; br++) {
      const line: BoxKind[] = [];
      for (let bc = 0; bc < this.boxCols; bc++) {
        const k = br * this.boxCols + bc;
        line.push(boxKindFor(sand[k]!, water[k]!, concrete[k]!, total));
      }
      out.push(line);
    }
    return out;
  }

  private cell(br: number, bc: number, r: number, c: number): number {
    return (br * this.res + r) * this.gridCols + (bc * this.res + c);
  }

  private fillFromTop(br: number, bc: number, id: number, count: number): void {
    let remaining = count;
    for (let r = 0; r < this.res && remaining > 0; r++) {
      for (let c = 0; c < this.res && remaining > 0; c++) {
        this.grid[this.cell(br, bc, r, c)] = id;
        remaining--;
      }
    }
  }

  /** A concrete box is first drawn as water on top of sand, until the reaction sets. */
  private seedMixture(br: number, bc: number, total: number): void {
    const half = total / 2;
    let i = 0;
    for (let r = 0; r < this.res; r++) {
      for (let c = 0; c < this.res; c++) {
        this.grid[this.cell(br, bc, r, c)] = i < half ? P_WATER : P_SAND;
        i++;
      }
    }
  }

  /** Counts down the visible reaction, then turns the whole box into permanent concrete (rule O6). */
  private tickReactions(): void {
    if (this.reacting.size === 0) return;
    for (const [key, left] of [...this.reacting]) {
      if (left > 1) {
        this.reacting.set(key, left - 1);
        continue;
      }
      const [br, bc] = key.split(",");
      this.solidify(Number(br), Number(bc));
      this.reacting.delete(key);
      this.solidified.add(key);
    }
  }

  private solidify(br: number, bc: number): void {
    for (let r = 0; r < this.res; r++) {
      for (let c = 0; c < this.res; c++) {
        const index = this.cell(br, bc, r, c);
        const id = this.grid[index];
        if (id === P_SAND || id === P_WATER) {
          this.grid[index] = P_CONCRETE;
          this.movesThisTick++;
        }
      }
    }
  }

  /** Advances every in-flight particle by one tick, landing the ones that have arrived. */
  private advancePour(): boolean {
    if (this.inFlight.length === 0) return false;
    const remaining: InFlight[] = [];
    for (const p of this.inFlight) {
      p.age++;
      if (p.age >= p.delay + p.duration) {
        if (p.targetRow >= 0) this.landInto(p.targetRow, p.targetCol, p.id);
      } else {
        remaining.push(p);
      }
    }
    this.inFlight = remaining;
    return true;
  }

  /** Puts a landed particle in the first empty cell of the target box (from the top). Never overwrites. */
  private landInto(br: number, bc: number, id: number): void {
    for (let r = 0; r < this.res; r++) {
      for (let c = 0; c < this.res; c++) {
        const idx = this.cell(br, bc, r, c);
        if (this.grid[idx] === P_EMPTY) {
          this.grid[idx] = id;
          return;
        }
      }
    }
    // The box is full: the particle is dropped instead of overwriting another one.
  }

  /** Bottom-up so a particle cannot be processed twice in one tick. */
  private settle(id: number, movedTo: Uint8Array, horizontal: boolean): void {
    for (let r = this.gridRows - 1; r >= 0; r--) {
      for (let c = 0; c < this.gridCols; c++) {
        const index = r * this.gridCols + c;
        if (this.grid[index] !== id) continue;
        if (movedTo[index] === 1) continue; // moved already this tick
        this.tryMove(r, c, index, movedTo, horizontal);
      }
    }
  }

  private tryMove(r: number, c: number, from: number, movedTo: Uint8Array, horizontal: boolean): void {
    const compR = Math.floor(r / this.res);
    const compC = Math.floor(c / this.res);

    if (this.canLand(r + 1, c, compR, compC)) return this.move(from, r + 1, c, movedTo);

    const order = this.parity === 0 ? [-1, 1] : [1, -1];
    for (const dc of order) {
      if (this.canLand(r + 1, c + dc, compR, compC)) return this.move(from, r + 1, c + dc, movedTo);
    }
    if (horizontal) {
      for (const dc of order) {
        if (this.canLand(r, c + dc, compR, compC)) return this.move(from, r, c + dc, movedTo);
      }
    }
  }

  /** Empty, inside the grid, and inside the same box (a box is a closed compartment). */
  private canLand(r: number, c: number, compR: number, compC: number): boolean {
    if (r < 0 || r >= this.gridRows || c < 0 || c >= this.gridCols) return false;
    if (Math.floor(r / this.res) !== compR || Math.floor(c / this.res) !== compC) return false;
    return this.grid[r * this.gridCols + c] === P_EMPTY;
  }

  private move(from: number, r: number, c: number, movedTo: Uint8Array): void {
    const to = r * this.gridCols + c;
    this.grid[to] = this.grid[from] ?? P_EMPTY;
    this.grid[from] = P_EMPTY;
    movedTo[to] = 1;
    this.movesThisTick++;
  }
}
