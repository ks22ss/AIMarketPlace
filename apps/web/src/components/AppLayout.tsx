import { Link, NavLink, Outlet } from "react-router-dom";
import { FileText, LogOut, MessageSquare, ShoppingBag, Wand2 } from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
  );

export function AppLayout() {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-svh w-full bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 text-sidebar-foreground">
        <Link
          to="/"
          className="px-3 font-heading text-lg font-semibold tracking-tight text-sidebar-foreground transition-opacity hover:opacity-90"
        >
          AI Marketplace
        </Link>

        <nav className="mt-8 flex flex-col gap-0.5" aria-label="Primary">
          <NavLink to="/chat" className={navLinkClass} end>
            <MessageSquare className="size-4 shrink-0 opacity-80" aria-hidden />
            Chat
          </NavLink>
          <NavLink to="/skills" className={navLinkClass}>
            <Wand2 className="size-4 shrink-0 opacity-80" aria-hidden />
            Skills
          </NavLink>
          <NavLink to="/documents" className={navLinkClass}>
            <FileText className="size-4 shrink-0 opacity-80" aria-hidden />
            Documents
          </NavLink>
          <NavLink to="/marketplace" className={navLinkClass}>
            <ShoppingBag className="size-4 shrink-0 opacity-80" aria-hidden />
            MarketPlace
          </NavLink>
        </nav>

        <div className="flex-1" />

        <Button
          type="button"
          variant="ghost"
          className="justify-start gap-2.5 text-sidebar-foreground/90 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
          onClick={() => logout()}
        >
          <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
          Sign out
        </Button>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
