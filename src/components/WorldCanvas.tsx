import { useEffect, useRef, useState } from "react";
import type { BoxKind } from "../world/box";
import type { World } from "../world/world";
import type { ShelfManager } from "../shelves/shelfManager";

const CELL = 84;
const GAP = 2;
const BAR = 8;

const COLORS: Record<BoxKind, string> = {
  empty: "#1f2937",
  halfSand: "#1f2937",
  fullSand: "#e0b857",
  fullWater: "#3b82f6",
  concrete: "#9ca3af",
};

interface Props {
  world: World;
  shelves?: ShelfManager;
  version?: number;
  onPaint?: (row: number, col: number) => void;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function WorldCanvas({ world, shelves, version = 0, onPaint }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = world.cols * CELL;
    const height = world.rows * CELL;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, width, height);

    for (let r = 0; r < world.rows; r++) {
      for (let c = 0; c < world.cols; c++) {
        const kind = world.getBox(r, c);
        const x = c * CELL + GAP;
        const y = r * CELL + GAP;
        const w = CELL - GAP * 2;
        const h = CELL - GAP * 2;

        roundRect(ctx, x, y, w, h, 8);
        ctx.fillStyle = COLORS[kind];
        ctx.fill();

        if (kind === "halfSand") {
          ctx.save();
          roundRect(ctx, x, y, w, h, 8);
          ctx.clip();
          ctx.fillStyle = "#e0b857";
          ctx.fillRect(x, y + h / 2, w, h / 2);
          ctx.restore();
        }

        if (kind === "concrete") {
          ctx.save();
          roundRect(ctx, x, y, w, h, 8);
          ctx.clip();
          ctx.strokeStyle = "rgba(17,24,39,0.55)";
          ctx.lineWidth = 2;
          for (let d = -w; d < w + h; d += 12) {
            ctx.beginPath();
            ctx.moveTo(x + d, y + h);
            ctx.lineTo(x + d + h, y);
            ctx.stroke();
          }
          ctx.restore();
        }

        const isHover = hover?.row === r && hover?.col === c;
        roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 7);
        ctx.strokeStyle = isHover ? "rgba(56,189,248,0.55)" : "#334155";
        ctx.lineWidth = isHover ? 2 : 1;
        ctx.stroke();
      }
    }

    // Per-box horizontal shelves (floors) and per-gap vertical shelves (walls).
    if (shelves) {
      ctx.fillStyle = "rgba(56,189,248,0.85)";
      for (const shelf of shelves.horizontal) {
        const x = shelf.col * CELL;
        const y = (shelf.row + 1) * CELL - BAR;
        const w = CELL * (1 - shelf.progress);
        if (w > 0) ctx.fillRect(x, y, w, BAR);
      }
      ctx.fillStyle = "rgba(244,114,182,0.85)";
      for (const shelf of shelves.vertical) {
        const x = (shelf.col + 1) * CELL - BAR;
        const y = shelf.row * CELL;
        const h = CELL * (1 - shelf.progress);
        if (h > 0) ctx.fillRect(x, y, BAR, h);
      }
    }
  }, [world, shelves, version, hover]);

  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    if (row < 0 || row >= world.rows || col < 0 || col >= world.cols) return null;
    return { row, col };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onPaint) return;
    painting.current = true;
    const cell = cellAt(e);
    if (cell) onPaint(cell.row, cell.col);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cell = cellAt(e);
    if (cell?.row !== hover?.row || cell?.col !== hover?.col) setHover(cell);
    if (!onPaint || !painting.current || !cell) return;
    onPaint(cell.row, cell.col);
  };
  const leave = () => {
    painting.current = false;
    setHover(null);
  };

  return (
    <canvas
      ref={ref}
      width={world.cols * CELL}
      height={world.rows * CELL}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (painting.current = false)}
      onPointerLeave={leave}
      className="board-canvas"
      style={{ maxWidth: "100%", cursor: onPaint ? "crosshair" : "default", touchAction: "none" }}
    />
  );
}
