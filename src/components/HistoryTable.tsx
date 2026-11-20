import { GATE_LABELS, type HistoryEntry } from "../game/session";

export function HistoryTable({ history, showPenalty }: { history: readonly HistoryEntry[]; showPenalty: boolean }) {
  if (history.length === 0) return <p className="empty">No actions yet.</p>;
  const headers = ["#", "Action", "Box", "s", "s'", "Cost", ...(showPenalty ? ["Concrete"] : []), "Total"];
  return (
    <table className="data-table">
      <thead>
        <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {history.map((e) => (
          <tr key={e.step}>
            <td>{e.step}</td>
            <td>{GATE_LABELS[e.kind]}</td>
            <td>({e.row + 1}, {e.col + 1})</td>
            <td>{e.sBefore}</td>
            <td>{e.sAfter ?? "â€“"}</td>
            <td>{e.cost}</td>
            {showPenalty && <td>{e.concretePenalty || "â€“"}</td>}
            <td>{e.runningTotal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
