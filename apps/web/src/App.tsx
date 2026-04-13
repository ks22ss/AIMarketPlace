import { useEffect, useState } from "react";
import { ActivityIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveApiUrl } from "@/apiBase";

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
    <main className="flex min-h-svh flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            AI Marketplace
          </h1>
          <p className="text-sm text-muted-foreground">
            Local dev shell with Tailwind CSS and shadcn/ui (Nova preset).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API health</CardTitle>
            <CardDescription>Proxied from the Express API in development.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {!error && !health ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : null}
            {health ? (
              <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs text-foreground">
                {JSON.stringify(health, null, 2)}
              </pre>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 border-t bg-transparent">
            <Button type="button" variant="secondary" size="sm" disabled>
              <ActivityIcon data-icon="inline-start" />
              Status check
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
