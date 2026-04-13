import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityIcon } from "lucide-react";

import { resolveApiUrl } from "@/apiBase";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type HealthResponse = {
  status: string;
  service?: string;
  timestamp?: string;
};

export function HomePage() {
  const { accessToken, user, authLoading, logout } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

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
      .catch((error: unknown) => {
        if (!cancelled) {
          setHealthError(error instanceof Error ? error.message : "Unknown error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-svh flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              AI Marketplace
            </h1>
            <p className="text-sm text-muted-foreground">
              Email and password auth with Postgres-backed users.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {accessToken ? (
              <>
                <Button type="button" variant="default" size="sm" asChild>
                  <Link to="/chat">Skill chat</Link>
                </Button>
                <Button type="button" variant="secondary" size="sm" asChild>
                  <Link to="/nodes/build">Node builder</Link>
                </Button>
                <Button type="button" variant="secondary" size="sm" asChild>
                  <Link to="/skills/build">Skill builder</Link>
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to="/docs/rag">Document RAG</Link>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={logout}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button type="button" size="sm" asChild>
                  <Link to="/register">Register</Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link to="/chat">Skill chat</Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link to="/nodes/build">Nodes</Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link to="/skills/build">Skills</Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link to="/docs/rag">Document RAG</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Profile is loaded from the API using your access token.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {authLoading ? (
              <p className="text-sm text-muted-foreground">Checking session…</p>
            ) : null}
            {!authLoading && accessToken && user ? (
              <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs text-foreground">
                {JSON.stringify(user, null, 2)}
              </pre>
            ) : null}
            {!authLoading && !accessToken ? (
              <p className="text-sm text-muted-foreground">
                You are not signed in. Use Register or Sign in to hit{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">GET /api/auth/me</code>.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API health</CardTitle>
            <CardDescription>Public endpoint (no auth required).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {healthError ? (
              <p className="text-sm text-destructive" role="alert">
                {healthError}
              </p>
            ) : null}
            {!healthError && !health ? (
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
