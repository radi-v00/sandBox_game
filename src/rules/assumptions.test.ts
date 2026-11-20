import { describe, expect, it } from "vitest";
import {
  flushTarget,
  isMovable,
  precedingLine,
  sideMaxMove,
  sideTargetCol,
  sideTransferAmount,
  transferAmount,
} from "./assumptions";

describe("side gate amount (at least half stays in the source)", () => {
  it("moves 0.5 from a full box into an empty box", () => {
    expect(sideTransferAmount(1, 0)).toBe(0.5);
  });
  it("moves nothing from a half box", () => {
    expect(sideTransferAmount(0.5, 0)).toBe(0);
  });
  it("is limited by the free space in the target", () => {
    expect(sideTransferAmount(1, 0.5)).toBe(0.5);
    expect(sideTransferAmount(1, 1)).toBe(0);
  });
  it("moves nothing from an empty box", () => {
    expect(sideTransferAmount(0, 0)).toBe(0);
  });
  it("never takes more than half", () => {
    expect(sideMaxMove(1)).toBe(0.5);
    expect(sideMaxMove(0.5)).toBe(0);
  });
});

describe("top-down flush amount", () => {
  it("moves everything that fits", () => {
    expect(transferAmount(1, 0)).toBe(1);
    expect(transferAmount(1, 0.5)).toBe(0.5);
    expect(transferAmount(0.5, 1)).toBe(0);
  });
  it("targets the box below, or the container for the last row", () => {
    expect(flushTarget(0, 1, 4)).toEqual({ row: 1, col: 1 });
    expect(flushTarget(3, 1, 4)).toBe("container");
  });
});

describe("side gate geometry", () => {
  it("targets the next column, or null at the edge", () => {
    expect(sideTargetCol(0, 3)).toBe(1);
    expect(sideTargetCol(2, 3)).toBeNull();
  });
});

describe("other rules", () => {
  it("concrete is not movable", () => {
    expect(isMovable("concrete")).toBe(false);
    expect(isMovable("fullSand")).toBe(true);
  });
  it("first line has no preceding line", () => {
    expect(precedingLine(0)).toBeNull();
    expect(precedingLine(3)).toBe(2);
  });
});
