import type { Orientation } from "../shelves/shelf";
import type { ShelfManager } from "../shelves/shelfManager";

interface Props {
  manager: ShelfManager;
  version: number;
  onPull: (orientation: Orientation, index: number) => void;
  onReturn: (orientation: Orientation, index: number) => void;
}

export function ShelfControls({ manager, version, onPull, onReturn }: Props) {
  const group = (title: string, orientation: Orientation) => {
    const list = orientation === "horizontal" ? manager.horizontal : manager.vertical;
    return (
      <div data-version={version} style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>{title}</div>
        <div className="shelf-list">
          {list.map((shelf) => (
            <div key={shelf.index} className={"shelf-row" + (shelf.isPulled ? " is-open" : "")}>
              <span className="shelf-name">
                {orientation === "horizontal" ? "Row" : "Col"} {shelf.index + 1}
              </span>
              <div className="shelf-progress">
                <div style={{ width: (shelf.progress * 100) + "%" }} />
              </div>
              <div className="shelf-buttons">
                <button className="btn btn-sm" onClick={() => onPull(orientation, shelf.index)}>Pull</button>
                <button className="btn btn-sm" onClick={() => onReturn(orientation, shelf.index)}>Ret</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      {group("Horizontal shelves", "horizontal")}
      {group("Vertical shelves", "vertical")}
    </div>
  );
}
