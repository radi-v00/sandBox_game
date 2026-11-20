import { useEffect, useRef, useState } from "react";
import { GATE_LABELS } from "../game/session";
import type { SolveRequest, SolveResponse, SolveResult } from "../planning/solver";
import { World } from "../world/world";

type Status = "idle" | "running" | "done" | "error";

interface Props {
  world: World;
  stateKey: string;
  onPreview: (world: World | null) => void;
}

export function SolverPanel({ world, stateKey, onPreview }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const modeB = world.mode === "B";

  const stop = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  useEffect(() => {
    stop();
    setStatus("idle");
    setResult(null);
    setError("");
    setStep(0);
    onPreview(null);
  }, [stateKey, onPreview]);

  useEffect(() => stop, []);

  const start = () => {
    stop();
    setResult(null);
    setError("");
    setStep(0);
    onPreview(null);
    setStatus("running");

    const worker = new Worker(new URL("../planning/solver.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<SolveResponse>) => {
      stop();
      if (e.data.type === "result") {
        setResult(e.data.result);
        setStatus("done");
      } else {
        setError(e.data.message);
        setStatus("error");
      }
    };
    worker.onerror = (e) => {
      stop();
      setError(e.message || "The solver worker failed.");
      setStatus("error");
    };
    const request: SolveRequest = { kinds: world.toKinds(), mode: world.mode };
    worker.postMessage(request);
  };

  const cancel = () => {
    stop();
    setStatus("idle");
  };

  const goTo = (index: number) => {
    if (!result) return;
    const clamped = Math.max(0, Math.min(result.steps.length, index));
    setStep(clamped);
    const kinds = clamped === 0 ? result.initialKinds : result.steps[clamped - 1]!.kinds;
    onPreview(World.fromKinds(kinds, world.mode));
  };

  const closePreview = () => {
    setStep(0);
    onPreview(null);
  };

  const headers = ["#", "Action", "Box", "s", "s'", "Cost", ...(modeB ? ["Concrete"] : []), "Total"];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 className="card-title" style={{ margin: 0 }}>Solver Â· Uniform Cost Search</h3>
        {status === "done" && result && (
          result.found
            ? <span className="badge badge-success">Goal found</span>
            : <span className="badge badge-danger">No goal</span>
        )}
        {status === "running" && <span className="badge badge-warning">Searchingâ€¦</span>}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "0 0 10px" }}>
        Finds the cheapest plan from the current world. Shelves are ignored for cost.
        {modeB && " Each new concrete box adds 10."}
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={start} disabled={status === "running"}>
          {status === "running" ? "Solvingâ€¦" : "Solve (UCS)"}
        </button>
        {status === "running" && <button className="btn" onClick={cancel}>Cancel</button>}
      </div>

      {status === "running" && <div className="progress is-indeterminate"><div /></div>}

      {status === "error" && (
        <div className="message is-error" style={{ marginTop: 10 }}>{error}</div>
      )}
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
            <button className="btn btn-sm" onClick={() => goTo(step - 1)} disabled={step <= 0}>â—€</button>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Step {step} / {result.steps.length}</span>
            <button className="btn btn-sm" onClick={() => goTo(step + 1)} disabled={step >= result.steps.length}>â–¶</button>
            <button className="btn btn-sm btn-ghost" onClick={closePreview}>Close preview</button>
          </div>
          {result.steps.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.steps.map((s, i) => (
                  <tr key={i} className={step === i + 1 ? "is-highlight" : undefined}>
                    <td>{i + 1}</td>
                    <td>{GATE_LABELS[s.request.kind]}</td>
                    <td>({s.request.row + 1}, {s.request.col + 1})</td>
                    <td>{s.outcome.sBefore}</td>
                    <td>{s.outcome.sAfter ?? "â€“"}</td>
                    <td>{s.outcome.cost}</td>
                    {modeB && <td>{s.outcome.concretePenalty || "â€“"}</td>}
                    <td>{s.runningTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
