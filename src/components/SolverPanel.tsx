import { useEffect, useRef, useState } from "react";
import { GATE_LABELS } from "../game/session";
import type { SolveRequest, SolveResponse, SolveResult, SolutionStep } from "../planning/solver";
import { World } from "../world/world";
import { boxValue } from "../world/box";
import type { Action, SearchResult } from "../algorithm/common";
import { initialFrom, step as algoStep } from "../algorithm/common";
import { dummy } from "../algorithm/dummy";
import { bfs }   from "../algorithm/bfs";
import { dfs }   from "../algorithm/dfs";
import { ucs as ucsAlgo } from "../algorithm/ucs";
import { astar } from "../algorithm/astar";

type Status = "idle" | "running" | "done" | "error";

type AlgoKey = "worker-ucs" | "dummy" | "bfs" | "dfs" | "algo-ucs" | "astar";

const ALGO_LABELS: Record<AlgoKey, string> = {
  "worker-ucs": "UCS (worker, large boards)",
  "dummy":      "Dummy (baseline)",
  "bfs":        "BFS (min actions)",
  "dfs":        "DFS (any solution)",
  "algo-ucs":   "UCS (in-process)",
  "astar":      "A* (h=0, = UCS)",
};

const IN_PROCESS: Record<Exclude<AlgoKey, "worker-ucs">, (s: any) => SearchResult> = {
  "dummy": dummy, "bfs": bfs, "dfs": dfs, "algo-ucs": ucsAlgo, "astar": astar,
};

interface Props {
  world: World;
  stateKey: string;
  onPreview: (world: World | null) => void;
}

export function SolverPanel({ world, stateKey, onPreview }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError]   = useState("");
  const [step, setStep]     = useState(0);
  const [algo, setAlgo]     = useState<AlgoKey>("worker-ucs");
  const [comparison, setComparison] =
    useState<Partial<Record<Exclude<AlgoKey, "worker-ucs">, SearchResult & { ms: number }>> | null>(null);
  const modeB = world.mode === "B";

  const stop = () => { workerRef.current?.terminate(); workerRef.current = null; };

  useEffect(() => {
    stop(); setStatus("idle"); setResult(null); setError(""); setStep(0);
    setComparison(null); onPreview(null);
  }, [stateKey, onPreview]);

  useEffect(() => stop, []);

  // ---------- run ----------
  const run = () => {
    setResult(null); setError(""); setStep(0); onPreview(null); setStatus("running");

    if (algo === "worker-ucs") {
      const worker = new Worker(new URL("../planning/solver.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<SolveResponse>) => {
        stop();
        if (e.data.type === "result") { setResult(e.data.result); setStatus("done"); }
        else { setError(e.data.message); setStatus("error"); }
      };
      worker.onerror = (e) => { stop(); setError(e.message || "Worker failed"); setStatus("error"); };
      const request: SolveRequest = { kinds: world.toKinds(), mode: world.mode };
      worker.postMessage(request);
      return;
    }

    try {
      const init = initialFrom(world);
      const r = IN_PROCESS[algo](init);
      setResult(algoResultToSolveResult(world, r));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const compareAll = () => {
    const out: Partial<Record<Exclude<AlgoKey, "worker-ucs">, SearchResult & { ms: number }>> = {};
    (Object.keys(IN_PROCESS) as (keyof typeof IN_PROCESS)[]).forEach((k) => {
      const init = initialFrom(world);
      const t0 = performance.now();
      try {
        out[k] = { ...IN_PROCESS[k](init), ms: performance.now() - t0 };
      } catch {
        out[k] = { found: false, path: [], totalCost: 0, expanded: 0, ms: 0 };
      }
    });
    setComparison(out);
  };

  const cancel = () => { stop(); setStatus("idle"); };

  const goTo = (index: number) => {
    if (!result) return;
    const clamped = Math.max(0, Math.min(result.steps.length, index));
    setStep(clamped);
    const kinds = clamped === 0 ? result.initialKinds : result.steps[clamped - 1]!.kinds;
    onPreview(World.fromKinds(kinds, world.mode));
  };

  const closePreview = () => { setStep(0); onPreview(null); };

  const headers = ["#", "Action", "Box", "s", "s'", "Cost", ...(modeB ? ["Concrete"] : []), "Total"];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 className="card-title" style={{ margin: 0 }}>Solver</h3>
        {status === "done" && result && (result.found
          ? <span className="badge badge-success">Goal found</span>
          : <span className="badge badge-danger">No goal</span>)}
        {status === "running" && <span className="badge badge-warning">Searching...</span>}
      </div>

      <div className="row" style={{ marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <select
          value={algo}
          onChange={(e) => setAlgo(e.target.value as AlgoKey)}
          disabled={status === "running"}
          style={{ padding: "4px 8px" }}
        >
          {(Object.keys(ALGO_LABELS) as AlgoKey[]).map((k) => (
            <option key={k} value={k}>{ALGO_LABELS[k]}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={run} disabled={status === "running"}>
          {status === "running" ? "Solving..." : "Solve"}
        </button>
        <button className="btn" onClick={compareAll} disabled={status === "running"}>
          Compare all (in-process)
        </button>
        {status === "running" && <button className="btn" onClick={cancel}>Cancel</button>}
      </div>

      {status === "running" && <div className="progress is-indeterminate"><div /></div>}
      {status === "error" && <div className="message is-error" style={{ marginTop: 10 }}>{error}</div>}
      {status === "done" && result && !result.found && (
        <div className="message is-error" style={{ marginTop: 10 }}>{result.reason}</div>
      )}

      {status === "done" && result?.found && (
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="badge badge-success">Cost {result.totalCost}</span>
            <span className="badge badge-neutral">{result.steps.length} steps</span>
            <span className="badge badge-neutral">{result.expanded} expanded</span>
            {modeB && <span className="badge badge-warning">+{result.penaltyTotal} concrete</span>}
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn btn-sm" onClick={() => goTo(step - 1)} disabled={step <= 0}>&lt;</button>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Step {step} / {result.steps.length}</span>
            <button className="btn btn-sm" onClick={() => goTo(step + 1)} disabled={step >= result.steps.length}>&gt;</button>
            <button className="btn btn-sm btn-ghost" onClick={closePreview}>Close preview</button>
          </div>
          {result.steps.length > 0 && (
            <table className="data-table">
              <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {result.steps.map((s, i) => (
                  <tr key={i} className={step === i + 1 ? "is-highlight" : undefined}>
                    <td>{i + 1}</td>
                    <td>{GATE_LABELS[s.request.kind]}</td>
                    <td>({s.request.row + 1}, {s.request.col + 1})</td>
                    <td>{s.outcome.sBefore}</td>
                    <td>{s.outcome.sAfter ?? "-"}</td>
                    <td>{s.outcome.cost}</td>
                    {modeB && <td>{s.outcome.concretePenalty || "-"}</td>}
                    <td>{s.runningTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {comparison && (
        <table className="data-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Algo</th><th>Found</th><th>Cost</th>
              <th>Expanded</th><th>Path</th><th>Time (ms)</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(comparison) as (keyof typeof comparison)[]).map((k) => {
              const r = comparison[k]!;
              return (
                <tr key={k}>
                  <td>{ALGO_LABELS[k as AlgoKey]}</td>
                  <td>{r.found ? "Y" : "N"}</td>
                  <td>{r.found ? r.totalCost : "-"}</td>
                  <td>{r.expanded}</td>
                  <td>{r.path.length}</td>
                  <td>{r.ms.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- adapter: algorithm/* SearchResult -> planning SolveResult ----------
function algoResultToSolveResult(world: World, r: SearchResult): SolveResult {
  let state = initialFrom(world);
  let actionCostTotal = 0;
  let penaltyTotal = 0;
  const steps: SolutionStep[] = [];

  r.path.forEach((action: Action, i: number) => {
    const child = algoStep(state, action);
    if (!child) throw new Error(`Replay failed at step ${i + 1}`);
    const sBefore = boxValue(state.world.getBox(action.row, action.col));
    const sAfterFinal = boxValue(child.state.world.getBox(action.row, action.col));
    const actionCost = action.kind === "sideGate" ? 1 : 1 + 4 * (sBefore + sAfterFinal);
    const penalty = child.cost - actionCost;

    actionCostTotal += actionCost;
    penaltyTotal += penalty;
    steps.push({
      request: { kind: action.kind, row: action.row, col: action.col },
      outcome: {
        sBefore,
        sAfter: action.kind === "sideGate" ? null : sAfterFinal,
        cost: actionCost,
        moved: 0,
        removed: 0,
        newConcrete: [],
        concretePenalty: penalty,
        description: `Step ${i + 1}`,
      },
      matrix: child.state.world.toMatrix(),
      kinds: child.state.world.toKinds(),
      runningTotal: actionCostTotal + penaltyTotal,
    });
    state = child.state;
  });

  return {
    found: r.found,
    reason: r.found ? "Goal reached." : "No goal state is reachable.",
    initialMatrix: world.toMatrix(),
    initialKinds: world.toKinds(),
    steps,
    totalCost: actionCostTotal + penaltyTotal,
    actionCostTotal,
    penaltyTotal,
    expanded: r.expanded,
  };
}