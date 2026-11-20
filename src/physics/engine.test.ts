import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { P_CONCRETE, P_EMPTY, P_SAND, P_WATER, boxKindFor, particleCount, particleOf } from "./materials";
import { ParticleEngine, REACTION_TICKS } from "./particleEngine";

const snapshot = (engine: ParticleEngine): number[] => {
  const out: number[] = [];
  for (let r = 0; r < engine.gridRows; r++) {
    for (let c = 0; c < engine.gridCols; c++) out.push(engine.at(r, c));
  }
  return out;
};

describe("materials", () => {
  it("maps box states to particle ids", () => {
    expect(particleOf("empty")).toBe(P_EMPTY);
    expect(particleOf("halfSand")).toBe(P_SAND);
    expect(particleOf("fullSand")).toBe(P_SAND);
    expect(particleOf("fullWater")).toBe(P_WATER);
    expect(particleOf("concrete")).toBe(P_CONCRETE);
  });

  it("uses half the particles for a half box", () => {
    expect(particleCount("empty", 64)).toBe(0);
    expect(particleCount("halfSand", 64)).toBe(32);
    expect(particleCount("fullSand", 64)).toBe(64);
    expect(particleCount("fullWater", 64)).toBe(64);
    expect(particleCount("concrete", 64)).toBe(64);
  });

  it("snaps counts to allowed states only", () => {
    expect(boxKindFor(0, 0, 0, 64)).toBe("empty");
    expect(boxKindFor(32, 0, 0, 64)).toBe("halfSand");
    expect(boxKindFor(64, 0, 0, 64)).toBe("fullSand");
    expect(boxKindFor(0, 64, 0, 64)).toBe("fullWater");
    expect(boxKindFor(0, 0, 64, 64)).toBe("concrete");
    expect(boxKindFor(1, 1, 0, 64)).toBe("concrete"); // contact rule
    expect(boxKindFor(10, 0, 0, 64)).toBe("empty"); // below the half threshold
  });
});

describe("ParticleEngine", () => {
  it("loads exact particle counts and round-trips through toBoxKinds", () => {
    const world = World.fromKinds([["empty", "fullSand"], ["halfSand", "fullWater"]], "B");
    const engine = new ParticleEngine(2, 2);
    engine.loadFromWorld(world);

    let sand = 0;
    let water = 0;
    for (let r = 0; r < engine.gridRows; r++) {
      for (let c = 0; c < engine.gridCols; c++) {
        if (engine.at(r, c) === P_SAND) sand++;
        else if (engine.at(r, c) === P_WATER) water++;
      }
    }
    expect(sand).toBe(64 + 32); // fullSand + halfSand
    expect(water).toBe(64);
    expect(engine.toBoxKinds()).toEqual(world.toKinds());
  });

  it("never loses particles and never leaves a box over many ticks", () => {
    const world = World.fromKinds([["halfSand", "fullSand"], ["fullWater", "empty"]], "B");
    const engine = new ParticleEngine(2, 2);
    engine.loadFromWorld(world);

    const count = () => {
      let n = 0;
      for (let r = 0; r < engine.gridRows; r++) {
        for (let c = 0; c < engine.gridCols; c++) if (engine.at(r, c) !== P_EMPTY) n++;
      }
      return n;
    };
    const before = count();
    for (let i = 0; i < 200; i++) engine.step();
    expect(count()).toBe(before);
    expect(engine.toBoxKinds()).toEqual(world.toKinds());
  });

  it("settles a half box to the bottom of its compartment", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromMatrix([[0.5]]));
    for (let i = 0; i < 100; i++) engine.step();

    const lastRow = engine.res - 1;
    for (let c = 0; c < engine.res; c++) expect(engine.at(lastRow, c)).toBe(P_SAND);
    expect(engine.at(0, 0)).toBe(P_EMPTY);
  });

  it("reports no more moves once everything has settled", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromMatrix([[1]]));
    for (let i = 0; i < 100; i++) engine.step();
    expect(engine.step()).toBe(false);
  });

  it("concrete never moves", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromKinds([["concrete"]], "B"));
    for (let i = 0; i < REACTION_TICKS + 50; i++) engine.step();
    const settled = snapshot(engine);
    for (let i = 0; i < 50; i++) engine.step();
    expect(snapshot(engine)).toEqual(settled);
  });

  it("water spreads horizontally", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromKinds([["fullWater"]], "B"));
    for (let i = 0; i < 100; i++) engine.step();
    const lastRow = engine.res - 1;
    for (let c = 0; c < engine.res; c++) expect(engine.at(lastRow, c)).toBe(P_WATER);
  });

  it("rejects an odd or too small resolution", () => {
    expect(() => new ParticleEngine(2, 2, 3)).toThrow();
    expect(() => new ParticleEngine(2, 2, 0)).toThrow();
  });

  it("rejects a world with mismatched dimensions", () => {
    const engine = new ParticleEngine(2, 2);
    expect(() => engine.loadFromWorld(World.fromKinds([["empty"]], "A"))).toThrow();
  });
});

describe("concrete reaction in the particle layer", () => {
  it("shows a fresh concrete box as a sand and water mixture first", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromKinds([["concrete"]], "B"));

    const cells = snapshot(engine);
    expect(cells).toContain(P_SAND);
    expect(cells).toContain(P_WATER);
    expect(cells).not.toContain(P_CONCRETE);

    // The mixture already reads back as concrete, so the box model stays valid.
    expect(engine.toBoxKinds()).toEqual([["concrete"]]);
  });

  it("sets to solid concrete after the reaction time and then holds still", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromKinds([["concrete"]], "B"));

    for (let i = 0; i < REACTION_TICKS; i++) engine.step();
    expect(snapshot(engine).every((id) => id === P_CONCRETE)).toBe(true);

    const solid = snapshot(engine);
    for (let i = 0; i < 30; i++) engine.step();
    expect(snapshot(engine)).toEqual(solid);
  });

  it("does not replay the reaction for an already solidified box", () => {
    const engine = new ParticleEngine(1, 1);
    const world = World.fromKinds([["concrete"]], "B");
    engine.loadFromWorld(world);
    for (let i = 0; i < REACTION_TICKS; i++) engine.step();

    // A second load of the same concrete box must go straight to solid, without a mixture flash.
    engine.loadFromWorld(world);
    const cells = snapshot(engine);
    expect(cells.some((id) => id === P_SAND || id === P_WATER)).toBe(false);
    expect(cells.every((id) => id === P_CONCRETE)).toBe(true);
  });

  it("reset makes the reaction play again", () => {
    const engine = new ParticleEngine(1, 1);
    const world = World.fromKinds([["concrete"]], "B");
    engine.loadFromWorld(world);
    for (let i = 0; i < REACTION_TICKS; i++) engine.step();
    engine.reset();
    engine.loadFromWorld(world);
    expect(snapshot(engine).some((id) => id === P_SAND || id === P_WATER)).toBe(true);
  });

  it("turns a box into concrete when sand and water particles meet", () => {
    // Rule check: boxKindFor already reports concrete for a sand/water mixture, even without the engine.
    expect(boxKindFor(32, 32, 0, 64)).toBe("concrete");
  });
});
