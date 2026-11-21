import { useEffect, useRef, useState } from "react";
import type { World } from "../world/world";
import { World as WorldClass } from "../world/world";
import type { BoxKind } from "../world/box";
import { ShelfManager, type ShelfPolicies } from "../shelves/shelfManager";
import type { Orientation } from "../shelves/shelf";
import { checkReturn } from "../shelves/returnPolicy";
import { GameSession } from "../game/session";
import type { GateKind } from "../rules/assumptions";
import { applyGate } from "../world/transitions";
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

export function SimulationScreen({
  initial,
  policies,
  onLoadExample,
  onBack,
}: Props) {
  const [session] = useState(() => new GameSession(initial));
  const [manager] = useState(
    () => new ShelfManager(initial.rows, initial.cols, policies),
  );
  const [engine] = useState(
    () => new ParticleEngine(initial.rows, initial.cols),
  );
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [msgKind, setMsgKind] = useState<"info" | "error" | "success">("info");
  const [preview, setPreview] = useState<World | null>(null);
  const [brush, setBrush] = useState<BoxKind | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [useParticles, setUseParticles] = useState(false);
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
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
      return;
    }
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

        // Auto-return: any shelf that is fully open and passes its policy's
        // return check closes itself. A shelf whose box above is clean has no
        // reason to stay open -- nothing can fall through it -- so it must return.
        const currentWorld = session.world;
        for (const s of manager.horizontal) {
          if (s.phase !== "open") continue;
          if (
            !checkReturn(
              "horizontal",
              s.row,
              s.col,
              manager.policies.horizontal,
              currentWorld,
            ).allowed
          )
            continue;
          if (
            manager.requestReturn("horizontal", s.row, s.col, currentWorld).ok
          )
            changed = true;
        }
        for (const s of manager.vertical) {
          if (s.phase !== "open") continue;
          if (
            !checkReturn(
              "vertical",
              s.row,
              s.col,
              manager.policies.vertical,
              currentWorld,
            ).allowed
          )
            continue;
          if (manager.requestReturn("vertical", s.row, s.col, currentWorld).ok)
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
  }, [manager, engine, paused, speed, useParticles, session]);

  const paint = (row: number, col: number) => {
    if (brush === null) return;
    try {
      session.paint(row, col, brush);
      say(
        "Painted " +
          brush +
          " at (" +
          (row + 1) +
          ", " +
          (col + 1) +
          "). History cleared.",
        "info",
      );
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
    session.replaceWorld(
      WorldClass.random(world.rows, world.cols, world.mode, seed, probs),
    );
    manager.reset();
    engine.reset();
    setBrush(null);
    say("Randomized board (seed " + seed + ").", "info");
    bump();
  };

  const reset = () => {
    session.reset();
    manager.reset();
    engine.reset();
    say("Reset to the starting board.", "info");
    bump();
  };

  const pull = (o: Orientation, r: number, c: number) => {
    if (preview) {
      say("Close the preview before acting.", "error");
      return;
    }
    const kind: GateKind = o === "horizontal" ? "topDown" : "sideGate";

    // 1) Open the shelf.
    const pulled = manager.pull(o, r, c);
    if (!pulled.ok) {
      say(pulled.reason, "error");
      bump();
      return;
    }

    // 2) Does the gate actually do anything on THIS box?
    const check = applyGate(session.world, { kind, row: r, col: c });
    const sourceKindBefore = session.world.getBox(r, c);
    let actionHappened = false;
    let actionReason = "";

    if (!check.ok) {
      actionReason = check.reason;
      say(actionReason, "error");
    } else if (check.outcome.moved > 0) {
      const result = session.apply({ kind, row: r, col: c }, manager);
      actionHappened = result.ok;
      actionReason = result.reason;
      say(actionReason, result.ok ? "success" : "error");
    } else {
      actionReason = pulled.reason + " Nothing moved in that box.";
      say(actionReason, "info");
    }

    // 3) Gravity cascade: any box with an open shelf must drain.
    const cascadeMoves = session.settle(manager);
    if (cascadeMoves.length > 0) {
      say(
        actionReason + " Cascaded " + cascadeMoves.length + " extra step(s).",
        "success",
      );
    }

    // 4) Particle animation - only when there was no cascade, so the pour
    //    lands exactly on the settled state instead of being cut short.
    if (
      actionHappened &&
      useParticles &&
      !preview &&
      cascadeMoves.length === 0
    ) {
      const afterKind = session.world.getBox(r, c);
      const id = particleOf(sourceKindBefore);
      const movedParticles =
        particleCount(sourceKindBefore, engine.particlesPerBox) -
        particleCount(afterKind, engine.particlesPerBox);
      const target =
        kind === "topDown"
          ? r + 1 < session.world.rows
            ? { row: r + 1, col: c }
            : null
          : { row: r, col: c + 1 };
      const concreteFormed = session.history.at(-1)?.newConcrete.length ?? 0;
      if (concreteFormed === 0 && id !== 0 && movedParticles > 0) {
        engine.playPour({
          source: { row: r, col: c },
          target,
          id,
          count: movedParticles,
        });
        skipNextLoad.current = true;
      }
    }

    bump();
  };

  const giveBack = (o: Orientation, r: number, c: number) => {
    const result = manager.requestReturn(o, r, c, session.world);
    say(result.reason, result.ok ? "info" : "error");
    bump();
  };

  const brushes: { label: string; kind: BoxKind | null }[] = [
    { label: "Off", kind: null },
    { label: "Eraser", kind: "empty" },
    { label: "\u00bd sand", kind: "halfSand" },
    { label: "Full sand", kind: "fullSand" },
    ...(modeB ? [{ label: "Water", kind: "fullWater" as BoxKind }] : []),
  ];

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Board</div>
          <div className="stat-value">
            {world.mode} \u00b7 {world.rows}\u00d7{world.cols}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Remaining sand</div>
          <div className="stat-value">
            {remainingSand(world)}
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginLeft: 4,
              }}
            >
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
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginLeft: 4,
                }}
              >
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
              />
            )}
          </div>
          {preview && (
            <div className="message is-success" style={{ marginTop: 10 }}>
              Previewing a solution step \u2014 the game state is unchanged.
            </div>
          )}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button className="btn btn-sm" onClick={() => setPaused((p) => !p)}>
              {paused ? "\u25b6 Resume" : "\u23f8 Pause"}
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Speed
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
              <span style={{ minWidth: 32 }}>{speed.toFixed(2)}\u00d7</span>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--text-muted)",
                marginLeft: "auto",
              }}
            >
              <input
                type="checkbox"
                checked={useParticles}
                onChange={(e) => setUseParticles(e.target.checked)}
              />
              Particle layer
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Shelves \u00b7 pull to act</div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              margin: "0 0 8px",
            }}
          >
            Shelves close themselves when their box above is clear.
          </p>
          <ShelfControls
            manager={manager}
            version={version}
            onPull={pull}
            onReturn={giveBack}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Board tools</div>
        <div className="row" style={{ gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Brush
          </span>
          {brushes.map((b) => (
            <button
              key={b.label}
              className={"btn btn-sm " + (brush === b.kind ? "is-active" : "")}
              onClick={() => setBrush(b.kind)}
            >
              {b.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={randomize}>
            \ud83c\udfb2 Randomize
          </button>
        </div>
        <p
          style={{ fontSize: 12, color: "var(--text-dim)", margin: "8px 0 0" }}
        >
          With a brush selected, click or drag on the board to paint. Editing is
          free and clears history.
        </p>
      </div>

      {goal && (
        <div className="message is-success" style={{ marginTop: 12 }}>
          \ud83c\udf89 Goal reached \u2014 no sand left. Total cost:{" "}
          {session.totalCost}.
        </div>
      )}

      {message && (
        <div
          className={
            "message " +
            (msgKind === "error"
              ? "is-error"
              : msgKind === "success"
                ? "is-success"
                : "")
          }
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
        <button className="btn" onClick={reset}>
          \u21ba Reset
        </button>
        <button className="btn" onClick={onLoadExample}>
          Load predefined 4\u00d72
        </button>
        <button className="btn btn-ghost" onClick={onBack}>
          \u2190 Back to configuration
        </button>
      </div>
    </div>
  );
}
