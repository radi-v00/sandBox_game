import { useState } from "react";
import { World } from "../world/world";
import type { Mode } from "../world/box";
import { RETURN_POLICIES, type ReturnPolicy } from "../shelves/returnPolicy";
import { DEFAULT_POLICIES, type ShelfPolicies } from "../shelves/shelfManager";

export function ConfigScreen({ onStart }: { onStart: (world: World, policies: ShelfPolicies) => void }) {
  const [mode, setMode] = useState<Mode>("A");
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(2);
  const [seed, setSeed] = useState(1);
  const [pEmpty, setPEmpty] = useState(0.5);
  const [pHalf, setPHalf] = useState(0.2);
  const [pFull, setPFull] = useState(0.3);
  const [pWater, setPWater] = useState(0.2);
  const [hPolicy, setHPolicy] = useState<ReturnPolicy>(DEFAULT_POLICIES.horizontal);
  const [vPolicy, setVPolicy] = useState<ReturnPolicy>(DEFAULT_POLICIES.vertical);
  const [preset, setPreset] = useState(false);
  const [error, setError] = useState("");

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setPreset(false);
    setter(v);
  };
  const num = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setter(Number(e.target.value));

  function loadExample() {
    setMode("A");
    setRows(4);
    setCols(2);
    setPreset(true);
    setError("");
  }

  function start() {
    try {
      const world = preset
        ? World.predefined4x2()
        : World.random(rows, cols, mode, seed, {
            empty: pEmpty,
            halfSand: pHalf,
            fullSand: pFull,
            fullWater: mode === "B" ? pWater : 0,
          });
      setError("");
      onStart(world, { horizontal: hPolicy, vertical: vPolicy });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const policySelect = (value: ReturnPolicy, setter: (p: ReturnPolicy) => void) => (
    <select className="select" value={value} onChange={(e) => setter(e.target.value as ReturnPolicy)}>
      {RETURN_POLICIES.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <h3 className="card-title">Mode</h3>
        <div className="segmented">
          <button className={mode === "A" ? "is-active" : ""} onClick={() => edit(setMode)("A")}>
            A Â· sand only
          </button>
          <button className={mode === "B" ? "is-active" : ""} onClick={() => edit(setMode)("B")}>
            B Â· sand + water + concrete
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">World</h3>
        <div className="row" style={{ gap: 16 }}>
          <div className="field">
            <label className="field-label">Rows</label>
            <input type="number" min={1} className="input" value={rows}
              onChange={num(edit(setRows))} style={{ width: 80 }} />
          </div>
          <div className="field">
            <label className="field-label">Columns</label>
            <input type="number" min={1} className="input" value={cols}
              onChange={num(edit(setCols))} style={{ width: 80 }} />
          </div>
          <div className="field">
            <label className="field-label">Seed</label>
            <input type="number" className="input" value={seed}
              onChange={num(edit(setSeed))} style={{ width: 120 }} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Generation probabilities</h3>
        <div className="row" style={{ gap: 12 }}>
          <div className="field">
            <label className="field-label">P(empty)</label>
            <input type="number" min={0} step={0.05} className="input" value={pEmpty}
              onChange={num(edit(setPEmpty))} style={{ width: 80 }} />
          </div>
          <div className="field">
            <label className="field-label">P(half sand)</label>
            <input type="number" min={0} step={0.05} className="input" value={pHalf}
              onChange={num(edit(setPHalf))} style={{ width: 80 }} />
          </div>
          <div className="field">
            <label className="field-label">P(full sand)</label>
            <input type="number" min={0} step={0.05} className="input" value={pFull}
              onChange={num(edit(setPFull))} style={{ width: 80 }} />
          </div>
          {mode === "B" && (
            <div className="field">
              <label className="field-label">P(water)</label>
              <input type="number" min={0} step={0.05} className="input" value={pWater}
                onChange={num(edit(setPWater))} style={{ width: 80 }} />
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "10px 0 0" }}>
          Probabilities are normalized. Concrete is never generated.
        </p>
      </div>

      <div className="card">
        <h3 className="card-title">Return policies</h3>
        <div className="row" style={{ gap: 16 }}>
          <div className="field">
            <label className="field-label">Horizontal shelves</label>
            {policySelect(hPolicy, setHPolicy)}
          </div>
          <div className="field">
            <label className="field-label">Vertical shelves</label>
            {policySelect(vPolicy, setVPolicy)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <button className="btn" onClick={loadExample}>Load predefined 4Ã—2 example</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={start}>Start simulation â†’</button>
        </div>
        {preset && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "10px 0 0" }}>
            Example selected, Mode A Â· 1 0 / 0 1 / 0 1 / 1 0
          </p>
        )}
        {error && <p style={{ color: "#fca5a5", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}
