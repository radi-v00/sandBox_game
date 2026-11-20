import { useEffect, useRef, useState } from "react";
import type { World } from "../world/world";
import { World as WorldClass } from "../world/world";
import type { BoxKind } from "../world/box";
import { ShelfManager, type ShelfPolicies } from "../shelves/shelfManager";
import type { Orientation } from "../shelves/shelf";
import { GATE_LABELS, GameSession } from "../game/session";
import type { GateKind } from "../rules/assumptions";
import { worldKey } from "../planning/state";
import { ParticleEngine } from "../physics/particleEngine";
import { particleCount, particleOf } from "../physics/materials";
import { concreteCount, remainingSand, sandBoxCount } from "../world/stats";
import { WorldCanvas } from "./WorldCanvas";
import { ParticleCanvas } from "./ParticleCanvas";
import { ShelfControls } from "./ShelfControls";
import { HistoryTable } from "./HistoryTable";
import { SolverPanel } from "./SolverPanel";

const STEP_MS = 1000 / 60;

interface Props {
  initial: World;
  policies: ShelfPolicies;
  onLoadExample: () => void;
  onBack: () => void;
}

export function SimulationScreen({ initial, policies, onLoadExample, onBack }: Props) {
  const [session] = useState(() => new GameSession(initial));
  const [manager] = useState(() => new ShelfManager(initial.rows, initial.cols, policies));
  const [engine] = useState(() => new ParticleEngine(initial.rows, initial.cols));
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [msgKind, setMsgKind] = useState<"info" | "error" | "success">("info");
  const [selRow, setSelRow] = useState(0);
  const [selCol, setSelCol] = useState(0);
  const [preview, setPreview] = useState<World | null>(null);
  const [brush, setBrush] = useState<BoxKind | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [useParticles, setUseParticles] = useState(false);
  const [gate, setGate] = useState<GateKind>("topDown");
  const skipNextLoad = useRef(false);

  const world = session.world;
  const key = worldKey(world);
  const goal = world.isGoalState();
  const modeB = world.mode === "B";
  const bump = () => setVersion((v) => v + 1);

  const say = (text: string, kind: "info" | "error" | "success" = "info") => {
    setMessage(text);
    setMsgKind(kind);
  };

  useEffect(() => {
    if (preview) return;
    if (skipNextLoad.current) { skipNextLoad.current = false; return; }
    engine.loadFromWorld(world);
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key, preview]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(now - last, 250);
      last = now;
      let changed = false;
      if (!paused) {
        if (manager.isAnimating()) {
          manager.update(dt * speed);
          changed = true;
        }
        if (useParticles) {
          acc += dt * speed;
          while (acc >= STEP_MS) {
            if (engine.step()) changed = true;
            acc -= STEP_MS;
          }
        }
      }
      if (changed) setVersion((v) => v + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [manager, engine, paused, speed, useParticles]);

  const paint = (row: number, col: number) => {
    if (brush === null) return;
    try {
      session.paint(row, col, brush);
      say(`Painted ${brush} at (${row + 1}, ${col + 1}). History cleared.`, "info");
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), "error");
    }
    bump();
  };

  const randomize = () => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const probs = modeB
      ? { empty: 0.5, halfSand: 0.15, fullSand: 0.2, fullWater: 0.15 }
      : { empty: 0.5, halfSand: 0.2, fullSand: 0.3 };
    session.replaceWorld(WorldClass.random(world.rows, world.cols, world.mode, seed, probs));
    manager.reset();
    engine.reset();
    setBrush(null);
    say(`Randomized board (seed ${seed}).`, "info");
    bump();
  };

  const reset = () => {
    session.reset();
    manager.reset();
    engine.reset();
    say("Reset to the starting board.", "info");
    bump();
  };

  const pull = (o: Orientation, i: number) => {
    say(manager.pull(o, i).reason, "info");
    bump();
  };
  const giveBack = (o: Orientation, i: number) => {
    const result = manager.requestReturn(o, i, session.world);
    say(result.reason, result.ok ? "info" : "error");
    bump();
  };

  const run = (kind: GateKind) => {
    const before = session.world.clone();
    const result = session.apply({ kind, row: selRow, col: selCol }, manager);
    say(result.reason, result.ok ? "success" : "error");
    if (result.ok && useParticles && !preview) {
      const sourceKind = before.getBox(selRow, selCol);
      const id = particleOf(sourceKind);
      const afterKind = session.world.getBox(selRow, selCol);
      const movedParticles =
        particleCount(sourceKind, engine.particlesPerBox) - particleCount(afterKind, engine.particlesPerBox);
      const target =
        kind === "topDown"
          ? selRow + 1 < world.rows
            ? { row: selRow + 1, col: selCol }
            : null
          : { row: selRow, col: selCol + 1 < world.cols ? selCol + 1 : selCol };
      const concreteFormed = session.history.at(-1)?.newConcrete.length ?? 0;
      if (concreteFormed === 0 && id !== 0 && movedParticles > 0) {
        engine.playPour({ source: { row: selRow, col: selCol }, target, id, count: movedParticles });
        skipNextLoad.current = true; // keep the pour alive
      }
    }
    bump();
  };

  const select = (value: number, setter: (n: number) => void, count: number) => (
    <select className="select" value={value} onChange={(e) => setter(Number(e.target.value))}>
      {Array.from({ length: count }, (_, i) => (
        <option key={i} value={i}>{i + 1}</option>
      ))}
    </select>
  );

  const brushes: { label: string; kind: BoxKind | null }[] = [
    { label: "Off", kind: null },
    { label: "Eraser", kind: "empty" },
    { label: "Â½ sand", kind: "halfSand" },
    { label: "Full sand", kind: "fullSand" },
    ...(modeB ? [{ label: "Water", kind: "fullWater" as BoxKind }] : []),
  ];

  return (
    <div>
      {/* Stats bar */}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Board</div>
          <div className="stat-value">{world.mode} Â· {world.rows}Ã—{world.cols}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Remaining sand</div>
          <div className="stat-value">
            {remainingSand(world)}
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
              ({sandBoxCount(world)} boxes)
            </span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Action cost</div>
          <div className="stat-value">{session.actionCostTotal}</div>
        </div>
        {modeB && (
          <div className="stat">
            <div className="stat-label">Concrete penalty</div>
            <div className="stat-value">
              {session.penaltyTotal}
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
                ({concreteCount(world)} boxes)
              </span>
            </div>
          </div>
        )}
        <div className="stat">
          <div className="stat-label">Total cost</div>
          <div className="stat-value">{session.totalCost}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Goal</div>
          <div className={"stat-value " + (goal ? "is-success" : "is-danger")}>
            {goal ? "Reached" : "In progress"}
          </div>
        </div>
      </div>

      {/* Board + shelves */}
      <div className="layout">
        <div className="card">
          <div className="card-title">Board</div>
          <div className="board-wrap">
            {useParticles && !preview ? (
              <ParticleCanvas engine={engine} world={world} version={version} />
            ) : (
              <WorldCanvas
                world={preview ?? world}
                shelves={preview ? undefined : manager}
                version={version}
                onPaint={preview || brush === null ? undefined : paint}
                onSelect={preview ? undefined : (r, c) => { setSelRow(r); setSelCol(c); }}
                selRow={preview ? undefined : selRow}
                selCol={preview ? undefined : selCol}
                gate={preview ? undefined : gate}
              />
            )}
          </div>
          {preview && (
            <div className="message is-success" style={{ marginTop: 10 }}>
              Previewing a solution step â€” the game state is unchanged.
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-sm" onClick={() => setPaused((p) => !p)}>
              {paused ? "â–¶ Resume" : "â¸ Pause"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
              Speed
              <input type="range" min={0.25} max={4} step={0.25} value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))} />
              <span style={{ minWidth: 32 }}>{speed.toFixed(2)}Ã—</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
              <input type="checkbox" checked={useParticles} onChange={(e) => setUseParticles(e.target.checked)} />
              Particle layer
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Shelves</div>
          <ShelfControls manager={manager} version={version} onPull={pull} onReturn={giveBack} />
        </div>
      </div>

      {/* Board tools + gate ops side by side */}
      <div className="two-col">
        <div className="card">
          <div className="card-title">Board tools</div>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Brush</span>
            {brushes.map((b) => (
              <button
                key={b.label}
                className={"btn btn-sm" + (brush === b.kind ? " is-active" : "")}
                onClick={() => setBrush(b.kind)}
              >
                {b.label}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={randomize}>ðŸŽ² Randomize</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "8px 0 0" }}>
            With a brush selected, click or drag on the board to paint. Editing is free and clears history.
          </p>
        </div>

        <div className="card">
          <div className="card-title">Gate operations</div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field">
              <label className="field-label">Row</label>
              {select(selRow, setSelRow, world.rows)}
            </div>
            <div className="field">
              <label className="field-label">Column</label>
              {select(selCol, setSelCol, world.cols)}
            </div>
            <div style={{ flex: 1 }} />
            <div className="segmented">
              <button className={gate === "topDown" ? "is-active" : ""}
                onClick={() => setGate("topDown")}>
                A Â· Top-Down
              </button>
              <button className={gate === "sideGate" ? "is-active" : ""}
                onClick={() => setGate("sideGate")}>
                B Â· Side Gate
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => run(gate)}>Run</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "8px 0 0" }}>
            A needs the row shelf fully pulled out. B needs the column shelf fully pulled out.
            Click a box on the board to select it.
          </p>
        </div>
      </div>

      {goal && (
        <div className="message is-success" style={{ marginTop: 12 }}>
          ðŸŽ‰ Goal reached â€” no sand left. Total cost: {session.totalCost}.
        </div>
      )}

      {message && (
        <div
          className={"message" + (msgKind === "error" ? " is-error" : msgKind === "success" ? " is-success" : "")}
          style={{ marginTop: 12 }}
        >
          {message}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <SolverPanel world={world} stateKey={key} onPreview={setPreview} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Action history</div>
        <HistoryTable history={session.history} showPenalty={modeB} />
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={reset}>â†º Reset</button>
        <button className="btn" onClick={onLoadExample}>Load predefined 4Ã—2</button>
        <button className="btn btn-ghost" onClick={onBack}>â† Back to configuration</button>
      </div>
    </div>
  );
}
