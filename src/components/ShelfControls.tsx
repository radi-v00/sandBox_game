import type { Orientation } from "../shelves/shelf";
import type { ShelfManager } from "../shelves/shelfManager";

interface Props {
  manager: ShelfManager;
  version: number;
  onPull: (orientation: Orientation, row: number, col: number) => void;
  onReturn: (orientation: Orientation, row: number, col: number) => void;
}

export function ShelfControls({ manager, version, onPull, onReturn }: Props) {
  const renderShelf = (orientation: Orientation, row: number, col: number) => {
    const shelf = manager.shelf(orientation, row, col);
    const label =
      orientation === "horizontal"
        ? "Box (" + (row + 1) + "," + (col + 1) + ")"
        : "Gap (" + (row + 1) + "," + (col + 1) + ")\u2192(" + (row + 1) + "," + (col + 2) + ")";
    return (
      <div key={orientation + "-" + row + "-" + col} className={"shelf-row" + (shelf.isPulled ? " is-open" : "")}>
        <span className="shelf-name">{label}</span>
        <div className="shelf-progress"><div style={{ width: (shelf.progress * 100) + "%" }} /></div>
        <div className="shelf-buttons">
          <button className="btn btn-sm" onClick={() => onPull(orientation, row, col)} disabled={shelf.isPulled}>
            Pull
          </button>
          <button className="btn btn-sm" onClick={() => onReturn(orientation, row, col)} disabled={!shelf.isPulled}>
            Ret
          </button>
        </div>
      </div>
    );
  };

  const groupH = (r: number) => (
    <div key={"h" + r} style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Row {r + 1}</div>
      <div className="shelf-list">
        {Array.from({ length: manager.cols }, (_, c) => renderShelf("horizontal", r, c))}
      </div>
    </div>
  );

  const groupV = (r: number) => (
    <div key={"v" + r} style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Row {r + 1}</div>
      <div className="shelf-list">
        {Array.from({ length: manager.cols - 1 }, (_, c) => renderShelf("vertical", r, c))}
      </div>
    </div>
  );

  return (
    <div data-version={version}>
      <div className="card-title">Horizontal (floors)</div>
      {Array.from({ length: manager.rows }, (_, r) => groupH(r))}
      {manager.cols > 1 && (
        <>
          <div className="card-title" style={{ marginTop: 16 }}>Vertical (walls)</div>
          {Array.from({ length: manager.rows }, (_, r) => groupV(r))}
        </>
      )}
    </div>
  );
}
