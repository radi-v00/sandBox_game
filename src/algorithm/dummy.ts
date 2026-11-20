import { isGoal, SearchResult, SearchState } from "./common";

export function dummy(init: SearchState): SearchResult {
  return isGoal(init)
    ? { found: true, path: [], totalCost: 0, expanded: 0 }
    : { found: false, path: [], totalCost: 0, expanded: 0 };
}
