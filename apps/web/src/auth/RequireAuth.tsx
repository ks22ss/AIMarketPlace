import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";

/**
 * Renders child routes only when a session exists. Sends guests to login and preserves the
 * intended path so a successful sign-in can return them there.
 */
export function RequireAuth() {
  const { accessToken, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  if (!accessToken) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from: returnTo }} />;
  }

  return (
    <div className="flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}
