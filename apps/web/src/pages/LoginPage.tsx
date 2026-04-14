import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { resolveApiUrl } from "@/apiBase";
import { useAuth } from "@/auth/AuthContext";
import { postAuthDestination } from "@/auth/postAuthRedirect";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAccessToken, accessToken, authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && accessToken) {
      navigate("/", { replace: true });
    }
  }, [accessToken, authLoading, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(resolveApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        accessToken?: string;
      };

      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Login failed");
        return;
      }

      if (!data.accessToken) {
        setError("Login response missing token");
        return;
      }

      setAccessToken(data.accessToken);
      navigate(postAuthDestination(location.state), { replace: true });
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Use your email and password to access the marketplace.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Credentials</CardTitle>
              <CardDescription>Password must be at least 8 characters.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 border-t bg-transparent">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                No account?{" "}
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  to="/register"
                  state={location.state}
                >
                  Create one
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
