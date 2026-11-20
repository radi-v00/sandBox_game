import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { checkReturn } from "./returnPolicy";
import { SHELF_ANIMATION_MS } from "./shelf";
import { ShelfManager } from "./shelfManager";

const clearWorld = () => new World(3, 3, "A");

describe("shelf animation states", () => {
  it("goes closed -> opening -> open -> closing -> closed", () => {
    const m = new ShelfManager(3, 3);
    const w = clearWorld();
    const s = m.shelf("horizontal", 0);
    expect(s.phase).toBe("closed");
    m.pull("horizontal", 0);
    expect(s.phase).toBe("opening");
    m.update(SHELF_ANIMATION_MS / 2);
    expect(s.progress).toBeCloseTo(0.5);
    m.update(SHELF_ANIMATION_MS);
    expect(s.phase).toBe("open");
    expect(s.progress).toBe(1);
    m.requestReturn("horizontal", 0, w);
    expect(s.phase).toBe("closing");
    m.update(SHELF_ANIMATION_MS);
    expect(s.phase).toBe("closed");
    expect(s.progress).toBe(0);
  });

  it("can reverse in the middle of the motion", () => {
    const m = new ShelfManager(2, 2);
    const w = new World(2, 2, "A");
    m.pull("vertical", 0);
    m.update(SHELF_ANIMATION_MS / 2);
    expect(m.requestReturn("vertical", 0, w).ok).toBe(true);
    m.update(SHELF_ANIMATION_MS / 4);
    expect(m.shelf("vertical", 0).progress).toBeCloseTo(0.25);
  });

  it("rejects a second pull and a return of a closed shelf", () => {
    const m = new ShelfManager(2, 2);
    expect(m.requestReturn("horizontal", 0, new World(2, 2, "A")).ok).toBe(false);
    m.pull("horizontal", 0);
    expect(m.pull("horizontal", 0).ok).toBe(false);
  });
});

describe("independence", () => {
  it("moving one shelf does not move another", () => {
    const m = new ShelfManager(3, 3);
    m.pull("horizontal", 1);
    m.update(100);
    expect(m.shelf("horizontal", 0).progress).toBe(0);
    expect(m.shelf("horizontal", 2).progress).toBe(0);
    expect(m.shelf("vertical", 1).progress).toBe(0);
  });

  it("horizontal and vertical shelves move simultaneously", () => {
    const m = new ShelfManager(3, 3);
    m.pull("horizontal", 1);
    m.pull("vertical", 1);
    m.update(SHELF_ANIMATION_MS / 2);
    expect(m.shelf("horizontal", 1).progress).toBeCloseTo(0.5);
    expect(m.shelf("vertical", 1).progress).toBeCloseTo(0.5);
    m.update(SHELF_ANIMATION_MS);
    expect(m.shelf("horizontal", 1).phase).toBe("open");
    expect(m.shelf("vertical", 1).phase).toBe("open");
  });

  it("shelves crossing at an intersection do not block each other", () => {
    const m = new ShelfManager(2, 2);
    const w = new World(2, 2, "A");
    m.pull("horizontal", 0);
    m.pull("vertical", 0);
    m.update(SHELF_ANIMATION_MS);
    expect(m.requestReturn("horizontal", 0, w).ok).toBe(true);
    expect(m.requestReturn("vertical", 0, w).ok).toBe(true);
    m.update(SHELF_ANIMATION_MS);
    expect(m.shelf("horizontal", 0).phase).toBe("closed");
    expect(m.shelf("vertical", 0).phase).toBe("closed");
  });

  it("rejects unknown shelf indices", () => {
    const m = new ShelfManager(2, 2);
    expect(() => m.shelf("horizontal", 2)).toThrow();
    expect(() => m.pull("vertical", -1)).toThrow();
  });
});

describe("return policies", () => {
  it("returnWhenClear: first row and first column are always clear", () => {
    const w = World.fromMatrix([[1, 1], [1, 1]]);
    expect(checkReturn("horizontal", 0, "returnWhenClear", w).allowed).toBe(true);
    expect(checkReturn("vertical", 0, "returnWhenClear", w).allowed).toBe(true);
  });

  it("returnWhenClear: row r is blocked when row r-1 has material", () => {
    const w = World.fromMatrix([[0, 0.5], [0, 0], [0, 0]]);
    const blocked = checkReturn("horizontal", 1, "returnWhenClear", w);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("row 1 still contains material");
    expect(checkReturn("horizontal", 2, "returnWhenClear", w).allowed).toBe(true);
  });

  it("returnWhenClear: column c is blocked when column c-1 has material", () => {
    const w = World.fromMatrix([[0, 0, 0], [1, 0, 0]]);
    expect(checkReturn("vertical", 1, "returnWhenClear", w).allowed).toBe(false);
    expect(checkReturn("vertical", 2, "returnWhenClear", w).allowed).toBe(true);
  });

  it("alwaysAllow and neverAllow ignore the world", () => {
    const w = World.fromMatrix([[1, 1], [1, 1]]);
    expect(checkReturn("horizontal", 1, "alwaysAllow", w).allowed).toBe(true);
    expect(checkReturn("vertical", 0, "neverAllow", w).allowed).toBe(false);
  });

  it("a blocked return leaves the shelf pulled out and reports the reason", () => {
    const w = World.fromMatrix([[1, 0], [0, 0]]);
    const m = new ShelfManager(2, 2, { horizontal: "returnWhenClear", vertical: "returnWhenClear" });
    m.pull("horizontal", 1);
    m.update(SHELF_ANIMATION_MS);
    const result = m.requestReturn("horizontal", 1, w);
    expect(result.ok).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
    expect(m.shelf("horizontal", 1).phase).toBe("open");
  });

  it("horizontal and vertical shelves use their own policy", () => {
    const w = World.fromMatrix([[1, 1], [0, 0]]);
    const m = new ShelfManager(2, 2, { horizontal: "neverAllow", vertical: "alwaysAllow" });
    m.pull("horizontal", 0);
    m.pull("vertical", 1);
    m.update(SHELF_ANIMATION_MS);
    expect(m.requestReturn("horizontal", 0, w).ok).toBe(false);
    expect(m.requestReturn("vertical", 1, w).ok).toBe(true);
  });
});
