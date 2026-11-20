import { useEffect, useRef } from "react";
import { P_CONCRETE, P_SAND, P_WATER } from "../physics/materials";
import type { ParticleEngine } from "../physics/particleEngine";
import type { World } from "../world/world";

const CELL = 84;
const COLORS: Record<number, string> = {
  [P_SAND]: "#e0b857",
  [P_WATER]: "#3b82f6",
  [P_CONCRETE]: "#6b7280",
};

interface Props {
  engine: ParticleEngine;
  world: World;
  version: number;
}

export function ParticleCanvas({ engine, world, version }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = world.cols * CELL;
    const height = world.rows * CELL;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, width, height);

    const size = CELL / engine.res;
    for (let r = 0; r < engine.gridRows; r++) {
      for (let c = 0; c < engine.gridCols; c++) {
        const id = engine.at(r, c);
        if (id === 0) continue;
        ctx.fillStyle = COLORS[id] ?? "#9ca3af";
        ctx.fillRect(c * size, r * size, size, size);
      }
    }
    for (const p of engine.flyingParticles()) {
      ctx.fillStyle = COLORS[p.id] ?? "#9ca3af";
      ctx.fillRect(p.c * size, p.r * size, size, size);
    }

    ctx.strokeStyle = "rgba(51,68,102,0.9)";
    ctx.lineWidth = 1;
    for (let r = 1; r < world.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(width, r * CELL);
      ctx.stroke();
    }
    for (let c = 1; c < world.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, height);
      ctx.stroke();
    }
  }, [engine, world, version]);

  return (
    <canvas
      ref={ref}
      width={world.cols * CELL}
      height={world.rows * CELL}
      className="board-canvas"
      style={{ maxWidth: "100%" }}
    />
  );
}
