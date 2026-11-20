import type { GateRequest } from "../world/transitions";

/** Every gate operation on every box, in a fixed order: row, column, then A before B. */
export function allGateRequests(rows: number, cols: number): GateRequest[] {
  const list: GateRequest[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      list.push({ kind: "topDown", row, col });
      list.push({ kind: "sideGate", row, col });
    }
  }
  return list;
}
