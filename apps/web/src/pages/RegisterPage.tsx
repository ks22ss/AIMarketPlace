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

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAccessToken, accessToken, authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && accessToken) {
      navigate("/", { replace: true });
    }
  }, [accessToken, authLoading, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(resolveApiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        accessToken?: string;
      };

      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Registration failed");
        return;
      }

      if (!data.accessToken) {
        setError("Registration response missing token");
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
            Create account
          </h1>
          <p className="text-sm text-muted-foreground">
            Register with email and password. You will be signed in automatically.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
              <CardDescription>Choose a strong password (minimum 8 characters).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 border-t bg-transparent">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Creating account…" : "Create account"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already registered?{" "}
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  to="/login"
                  state={location.state}
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
