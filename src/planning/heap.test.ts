import { describe, expect, it } from "vitest";
import { MinHeap } from "./heap";

describe("MinHeap", () => {
  it("pops in priority order", () => {
    const h = new MinHeap<string>();
    [5, 1, 4, 2, 3, 0, 9, 7].forEach((p) => h.push(`p${p}`, p));
    const out: number[] = [];
    for (let x = h.pop(); x !== undefined; x = h.pop()) out.push(x.priority);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 7, 9]);
  });

  it("pops equal priorities in insertion order", () => {
    const h = new MinHeap<string>();
    ["a", "b", "c", "d"].forEach((v) => h.push(v, 1));
    expect([h.pop()?.value, h.pop()?.value, h.pop()?.value, h.pop()?.value]).toEqual(["a", "b", "c", "d"]);
  });

  it("returns undefined when empty", () => {
    expect(new MinHeap<number>().pop()).toBeUndefined();
  });
});
