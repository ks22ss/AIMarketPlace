import { useEffect, useMemo, useState } from "react";

import { resolveApiUrl } from "@/apiBase";
import { cn } from "@/lib/utils";

type HealthResponse = {
  status: string;
  service?: string;
  timestamp?: string;
};

type HealthState =
  | { kind: "unknown" }
  | { kind: "healthy"; payload: HealthResponse }
  | { kind: "unhealthy"; message: string };

async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(resolveApiUrl("/api/health"), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export function ApiHealthDot({ className }: { className?: string }) {
  const [state, setState] = useState<HealthState>({ kind: "unknown" });

  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;

    async function pollOnce() {
      controller?.abort();
      controller = new AbortController();
      try {
        const data = await fetchHealth(controller.signal);
        if (mounted) {
          setState({ kind: "healthy", payload: data });
        }
      } catch (err: unknown) {
        if (!mounted) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setState({ kind: "unhealthy", message: err instanceof Error ? err.message : "Health check failed" });
      }
    }

    void pollOnce();
    const interval = window.setInterval(() => void pollOnce(), 10_000);

    return () => {
      mounted = false;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, []);

  const title = useMemo(() => {
    switch (state.kind) {
      case "healthy":
        return `API healthy${state.payload.service ? ` (${state.payload.service})` : ""}`;
      case "unhealthy":
        return `API unhealthy (${state.message})`;
      default:
        return "Checking API health…";
    }
  }, [state]);

  return (
    <div className={cn("inline-flex items-center justify-center", className)} title={title} aria-label={title}>
      <span
        className={cn(
          "size-2.5 rounded-full ring-2 ring-background",
          state.kind === "healthy" ? "bg-emerald-500" : null,
          state.kind === "unhealthy" ? "bg-destructive" : null,
          state.kind === "unknown" ? "bg-muted-foreground/40" : null,
        )}
        aria-hidden
      />
    </div>
  );
}

