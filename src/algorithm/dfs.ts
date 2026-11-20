import { hash, isGoal, successors, SearchResult, SearchState, Action } from "./common";

export function dfs(init: SearchState, maxExpansions = 200_000): SearchResult {
  const stack: { s: SearchState; path: Action[]; g: number }[] = [{ s: init, path: [], g: 0 }];
  const seen = new Set<string>();
  let expanded = 0;

  while (stack.length > 0 && expanded < maxExpansions) {
    const { s, path, g } = stack.pop()!;
    const h = hash(s);
    if (seen.has(h)) continue;
    seen.add(h);
    expanded++;
    if (isGoal(s)) return { found: true, path, totalCost: g, expanded };
    const children = successors(s);
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i];
      if (!seen.has(hash(c.state))) {
        stack.push({ s: c.state, path: [...path, c.action], g: g + c.cost });
      }
    }
  }
  return { found: false, path: [], totalCost: 0, expanded };
}