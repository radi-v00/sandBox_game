import {
  hash,
  isGoal,
  successors,
  SearchResult,
  SearchState,
  Action,
} from "./common";

export function bfs(init: SearchState, maxExpansions = 200_000): SearchResult {
  const q: { s: SearchState; path: Action[]; g: number }[] = [
    { s: init, path: [], g: 0 },
  ];
  const seen = new Set<string>([hash(init)]);
  let expanded = 0;

  while (q.length > 0 && expanded < maxExpansions) {
    const { s, path, g } = q.shift()!;
    expanded++;
    if (isGoal(s)) return { found: true, path, totalCost: g, expanded };
    for (const c of successors(s)) {
      const h = hash(c.state);
      if (seen.has(h)) continue;
      seen.add(h);
      q.push({ s: c.state, path: [...path, c.action], g: g + c.cost });
    }
  }
  return { found: false, path: [], totalCost: 0, expanded };
}
