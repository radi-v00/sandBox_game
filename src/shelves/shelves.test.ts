import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { checkReturn } from "./returnPolicy";
import { SHELF_ANIMATION_MS } from "./shelf";
import { ShelfManager } from "./shelfManager";

const clearWorld = () => new World(3, 3, "A");

describe("shelf layout", () => {
  it("creates one horizontal shelf per box and one vertical shelf per gap", () => {
    const m = new ShelfManager(2, 3);
    expect(m.horizontal).toHaveLength(6);
    expect(m.vertical).toHaveLength(4);
    expect(() => m.shelf("vertical", 0, 2)).toThrow();
  });

  it("1x2 grid has 2 horizontal and 1 vertical shelf", () => {
    const m = new ShelfManager(1, 2);
    expect(m.horizontal).toHaveLength(2);
    expect(m.vertical).toHaveLength(1);
  });

  it("single-column grid has no vertical shelves", () => {
    const m = new ShelfManager(4, 1);
    expect(m.horizontal).toHaveLength(4);
    expect(m.vertical).toHaveLength(0);
  });
});

describe("shelf animation states", () => {
  it("goes closed -> opening -> open -> closing -> closed", () => {
    const m = new ShelfManager(3, 3);
    const w = clearWorld();
    const s = m.shelf("horizontal", 0, 0);
    expect(s.phase).toBe("closed");
    m.pull("horizontal", 0, 0);
    expect(s.phase).toBe("opening");
    m.update(SHELF_ANIMATION_MS / 2);
    expect(s.progress).toBeCloseTo(0.5);
    m.update(SHELF_ANIMATION_MS);
    expect(s.phase).toBe("open");
    expect(s.progress).toBe(1);
    m.requestReturn("horizontal", 0, 0, w);
    expect(s.phase).toBe("closing");
    m.update(SHELF_ANIMATION_MS);
    expect(s.phase).toBe("closed");
    expect(s.progress).toBe(0);
  });

  it("can reverse in the middle of the motion", () => {
    const m = new ShelfManager(2, 2);
    const w = new World(2, 2, "A");
    m.pull("vertical", 0, 0);
    m.update(SHELF_ANIMATION_MS / 2);
    expect(m.requestReturn("vertical", 0, 0, w).ok).toBe(true);
    m.update(SHELF_ANIMATION_MS / 4);
    expect(m.shelf("vertical", 0, 0).progress).toBeCloseTo(0.25);
  });

  it("rejects a second pull and a return of a closed shelf", () => {
    const m = new ShelfManager(2, 2);
    expect(m.requestReturn("horizontal", 0, 0, new World(2, 2, "A")).ok).toBe(false);
    m.pull("horizontal", 0, 0);
    expect(m.pull("horizontal", 0, 0).ok).toBe(false);
  });
});

describe("independence", () => {
  it("moving one box's shelf does not move another box's shelf", () => {
    const m = new ShelfManager(3, 3);
    m.pull("horizontal", 1, 1);
    m.update(100);
    expect(m.shelf("horizontal", 0, 0).progress).toBe(0);
    expect(m.shelf("horizontal", 1, 0).progress).toBe(0);
    expect(m.shelf("horizontal", 2, 1).progress).toBe(0);
    expect(m.shelf("vertical", 1, 0).progress).toBe(0);
  });

  it("horizontal and vertical shelves move simultaneously", () => {
    const m = new ShelfManager(3, 3);
    m.pull("horizontal", 1, 0);
    m.pull("vertical", 1, 0);
    m.update(SHELF_ANIMATION_MS / 2);
    expect(m.shelf("horizontal", 1, 0).progress).toBeCloseTo(0.5);
    expect(m.shelf("vertical", 1, 0).progress).toBeCloseTo(0.5);
    m.update(SHELF_ANIMATION_MS);
    expect(m.shelf("horizontal", 1, 0).phase).toBe("open");
    expect(m.shelf("vertical", 1, 0).phase).toBe("open");
  });

  it("shelves crossing at an intersection do not block each other", () => {
    const m = new ShelfManager(2, 2);
    const w = new World(2, 2, "A");
    m.pull("horizontal", 0, 0);
    m.pull("vertical", 0, 0);
    m.update(SHELF_ANIMATION_MS);
    expect(m.requestReturn("horizontal", 0, 0, w).ok).toBe(true);
    expect(m.requestReturn("vertical", 0, 0, w).ok).toBe(true);
    m.update(SHELF_ANIMATION_MS);
    expect(m.shelf("horizontal", 0, 0).phase).toBe("closed");
    expect(m.shelf("vertical", 0, 0).phase).toBe("closed");
  });

  it("rejects unknown shelf coordinates", () => {
    const m = new ShelfManager(2, 2);
    expect(() => m.shelf("horizontal", 2, 0)).toThrow();
    expect(() => m.shelf("horizontal", 0, 2)).toThrow();
    expect(() => m.pull("vertical", -1, 0)).toThrow();
  });
});

describe("return policies", () => {
  it("returnWhenClear: top row is always clear", () => {
    const w = World.fromMatrix([[1, 1], [1, 1]]);
    expect(checkReturn("horizontal", 0, 0, "returnWhenClear", w).allowed).toBe(true);
    expect(checkReturn("horizontal", 0, 1, "returnWhenClear", w).allowed).toBe(true);
  });

  it("returnWhenClear: box (r, c) is blocked when box (r-1, c) has material", () => {
    const w = World.fromMatrix([[0, 0.5], [0, 0], [0, 0]]);
    // Above (1, 0) is (0, 0), empty -> allowed.
    expect(checkReturn("horizontal", 1, 0, "returnWhenClear", w).allowed).toBe(true);
    // Above (1, 1) is (0, 1) with 0.5 -> blocked.
    const blocked = checkReturn("horizontal", 1, 1, "returnWhenClear", w);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("material");
    // Above (2, 0) is (1, 0), empty -> allowed.
    expect(checkReturn("horizontal", 2, 0, "returnWhenClear", w).allowed).toBe(true);
  });

  it("returnWhenClear: vertical shelves always allow", () => {
    const w = World.fromMatrix([[1, 1, 1], [1, 1, 1]]);
    expect(checkReturn("vertical", 0, 0, "returnWhenClear", w).allowed).toBe(true);
    expect(checkReturn("vertical", 1, 0, "returnWhenClear", w).allowed).toBe(true);
  });

  it("alwaysAllow and neverAllow ignore the world", () => {
    const w = World.fromMatrix([[1, 1], [1, 1]]);
    expect(checkReturn("horizontal", 1, 0, "alwaysAllow", w).allowed).toBe(true);
    expect(checkReturn("vertical", 0, 0, "neverAllow", w).allowed).toBe(false);
  });

  it("a blocked return leaves the shelf pulled out and reports the reason", () => {
    const w = World.fromMatrix([[1, 0], [0, 0]]);
    const m = new ShelfManager(2, 2, { horizontal: "returnWhenClear", vertical: "returnWhenClear" });
    m.pull("horizontal", 1, 0);
    m.update(SHELF_ANIMATION_MS);
    const result = m.requestReturn("horizontal", 1, 0, w);
    expect(result.ok).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
    expect(m.shelf("horizontal", 1, 0).phase).toBe("open");
  });

  it("horizontal and vertical shelves use their own policy", () => {
    const w = World.fromMatrix([[1, 1], [0, 0]]);
    const m = new ShelfManager(2, 2, { horizontal: "neverAllow", vertical: "alwaysAllow" });
    m.pull("horizontal", 0, 0);
    m.pull("vertical", 1, 0);
    m.update(SHELF_ANIMATION_MS);
    expect(m.requestReturn("horizontal", 0, 0, w).ok).toBe(false);
    expect(m.requestReturn("vertical", 1, 0, w).ok).toBe(true);
  });
});
