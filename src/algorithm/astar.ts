import { hash, isGoal, MinHeap, successors, SearchResult, SearchState, Action } from "./common";

// Placeholder heuristic: h = 0 => A* == UCS.
// Swap in an admissible lower bound when one is proven.
export function heuristic(_s: SearchState): number {
  return 0;
}

export function astar(init: SearchState, maxExpansions = 200_000): SearchResult {
  const pq = new MinHeap<{ s: SearchState; path: Action[]; g: number; f: number }>(
    (a, b) => a.f < b.f,
  );
  pq.push({ s: init, path: [], g: 0, f: heuristic(init) });
  const best = new Map<string, number>([[hash(init), 0]]);
  let expanded = 0;

  while (pq.size() > 0 && expanded < maxExpansions) {
    const node = pq.pop()!;
    const nh = hash(node.s);
    if ((best.get(nh) ?? Infinity) < node.g) continue;
    if (isGoal(node.s)) return { found: true, path: node.path, totalCost: node.g, expanded };
    expanded++;
    for (const c of successors(node.s)) {
      const ch = hash(c.state);
      const ng = node.g + c.cost;
      if (ng >= (best.get(ch) ?? Infinity)) continue;
      best.set(ch, ng);
      pq.push({ s: c.state, path: [...node.path, c.action], g: ng, f: ng + heuristic(c.state) });
    }
  }

  return { found: false, path: [], totalCost: 0, expanded };
}
