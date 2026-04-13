import { useEffect, useState } from "react";
import { resolveApiUrl } from "./apiBase";

type HealthResponse = {
  status: string;
  service?: string;
  timestamp?: string;
};

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(resolveApiUrl("/api/health"))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<HealthResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setHealth(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="layout">
      <h1>AI Marketplace</h1>
      <p className="muted">Local dev base — API + web + Docker services.</p>
      <section className="card">
        <h2>API health</h2>
        {error ? <p className="error">{error}</p> : null}
        {!error && !health ? <p>Loading…</p> : null}
        {health ? (
          <pre className="pre">{JSON.stringify(health, null, 2)}</pre>
        ) : null}
      </section>
    </main>
  );
}
