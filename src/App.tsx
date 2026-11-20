import { useState } from "react";
import { World } from "./world/world";
import type { ShelfPolicies } from "./shelves/shelfManager";
import { ConfigScreen } from "./components/ConfigScreen";
import { SimulationScreen } from "./components/SimulationScreen";

interface Session {
  id: number;
  world: World;
  policies: ShelfPolicies;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  const start = (world: World, policies: ShelfPolicies) =>
    setSession((prev) => ({ id: (prev?.id ?? 0) + 1, world, policies }));

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">
            <span className="logo">â—§</span>
            Shelf World
          </h1>
          <div className="app-subtitle">Flush the sand, avoid the concrete, minimize the cost.</div>
        </div>
      </header>
      {session === null ? (
        <ConfigScreen onStart={start} />
      ) : (
        <SimulationScreen
          key={session.id}
          initial={session.world}
          policies={session.policies}
          onLoadExample={() => start(World.predefined4x2(), session.policies)}
          onBack={() => setSession(null)}
        />
      )}
    </div>
  );
}
