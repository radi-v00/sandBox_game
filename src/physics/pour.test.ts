import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { P_EMPTY, P_SAND, P_WATER } from "./materials";
import { ParticleEngine } from "./particleEngine";

const countOf = (engine: ParticleEngine, id: number): number => {
  let n = 0;
  for (let r = 0; r < engine.gridRows; r++) {
    for (let c = 0; c < engine.gridCols; c++) if (engine.at(r, c) === id) n++;
  }
  return n;
};

describe("gate pour animation", () => {
  it("takes particles out of the source and shows them in flight", () => {
    const engine = new ParticleEngine(2, 1);
    engine.loadFromWorld(World.fromMatrix([[1], [0]]));
    for (let i = 0; i < 100; i++) engine.step(); // settle

    const before = countOf(engine, P_SAND);
    engine.playPour({ source: { row: 0, col: 0 }, target: { row: 1, col: 0 }, id: P_SAND, count: 64 });

    expect(countOf(engine, P_SAND)).toBe(before - 64); // they left the grid
    expect(engine.flyingParticles().length).toBe(64);
  });

  it("lands each particle in the target and conserves the total count", () => {
    const engine = new ParticleEngine(2, 1);
    engine.loadFromWorld(World.fromMatrix([[1], [0]]));
    for (let i = 0; i < 100; i++) engine.step();
    engine.playPour({ source: { row: 0, col: 0 }, target: { row: 1, col: 0 }, id: P_SAND, count: 64 });

    for (let i = 0; i < 40; i++) engine.step();
    expect(engine.flyingParticles().length).toBe(0);
    expect(engine.toBoxKinds()).toEqual([[0], [1]]);
  });

  it("discards particles aimed at the container", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromMatrix([[1]]));
    for (let i = 0; i < 100; i++) engine.step();
    engine.playPour({ source: { row: 0, col: 0 }, target: null, id: P_SAND, count: 64 });

    for (let i = 0; i < 40; i++) engine.step();
    expect(engine.flyingParticles().length).toBe(0);
    expect(countOf(engine, P_SAND)).toBe(0);
    expect(engine.toBoxKinds()).toEqual([[0]]);
  });

  it("does not overwrite a landed particle", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromKinds([["halfSand"]], "A"));
    for (let i = 0; i < 100; i++) engine.step();
    engine.playPour({ source: { row: 0, col: 0 }, target: { row: 0, col: 0 }, id: P_SAND, count: 32 });

    for (let i = 0; i < 40; i++) engine.step();
    // 32 already in place plus 32 landed is a full box; nothing was dropped or double-written.
    expect(countOf(engine, P_SAND)).toBe(64);
  });

  it("cancels a pour when the world is reloaded", () => {
    const engine = new ParticleEngine(1, 1);
    engine.loadFromWorld(World.fromMatrix([[1]]));
    engine.playPour({ source: { row: 0, col: 0 }, target: null, id: P_SAND, count: 64 });
    expect(engine.flyingParticles().length).toBeGreaterThan(0);
    engine.loadFromWorld(World.fromMatrix([[1]]));
    expect(engine.flyingParticles().length).toBe(0);
  });

  it("keeps flying water separate from sand", () => {
    const engine = new ParticleEngine(1, 2);
    engine.loadFromWorld(World.fromKinds([["fullWater", "empty"]], "B"));
    engine.playPour({ source: { row: 0, col: 0 }, target: { row: 0, col: 1 }, id: P_WATER, count: 64 });
    expect(engine.flyingParticles().every((p) => p.id === P_WATER)).toBe(true);
    for (let i = 0; i < 40; i++) engine.step();
    expect(engine.toBoxKinds()).toEqual([["empty", "fullWater"]]);
  });

  it("leaves an untouched box alone while another box pours", () => {
    const engine = new ParticleEngine(2, 2);
    engine.loadFromWorld(World.fromMatrix([[1, 1], [0, 0]]));
    for (let i = 0; i < 100; i++) engine.step();
    engine.playPour({ source: { row: 0, col: 1 }, target: { row: 1, col: 1 }, id: P_SAND, count: 64 });
    for (let i = 0; i < 40; i++) engine.step();
    expect(engine.toBoxKinds()).toEqual([[1, 0], [0, 1]]);
  });

  it("reports in-flight particles as part of their target, not their source", () => {
    const engine = new ParticleEngine(2, 1);
    engine.loadFromWorld(World.fromMatrix([[1], [0]]));
    for (let i = 0; i < 100; i++) engine.step();
    engine.playPour({ source: { row: 0, col: 0 }, target: { row: 1, col: 0 }, id: P_SAND, count: 64 });
    // Immediately after the pour starts, the target already reads as full.
    expect(engine.toBoxKinds()).toEqual([[0], [1]]);
  });
});
