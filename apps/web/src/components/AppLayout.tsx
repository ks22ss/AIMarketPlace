import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Boxes,
  FileText,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Wand2,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { useAuth } from "@/auth/AuthContext";
import { ApiHealthDot } from "@/components/ApiHealthDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStickyBoolean } from "@/lib/useStickyBoolean";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Chat", icon: MessageSquare, end: true },
  { to: "/nodes", label: "Nodes", icon: Boxes },
  { to: "/skills", label: "Skills", icon: Wand2 },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/marketplace", label: "Marketplace", icon: ShoppingBag },
];

export function AppLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useStickyBoolean("sidebar.left.collapsed", false);

  function handleSignOut() {
    logout();
    navigate("/login", { replace: true });
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      collapsed ? "justify-center px-2" : "",
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    );

  return (
    <div className="flex min-h-svh w-full bg-background">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-4 text-sidebar-foreground transition-[width] duration-200 ease-out",
          collapsed ? "w-14 px-2" : "w-60 px-3",
        )}
        aria-label="Primary sidebar"
      >
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
          {!collapsed ? (
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2 py-1.5 font-heading text-lg font-semibold tracking-tight transition-opacity hover:opacity-90",
                  isActive ? "text-sidebar-foreground" : "text-sidebar-foreground/85",
                )
              }
            >
              AI Marketplace
            </NavLink>
          ) : null}
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </button>
        </div>

        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                {!collapsed ? <span>{item.label}</span> : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex-1" />

        <Button
          type="button"
          variant="ghost"
          className={cn(
            "gap-2.5 text-sidebar-foreground/90 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            collapsed ? "justify-center" : "justify-start",
          )}
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          aria-label="Sign out"
        >
          <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
          {!collapsed ? <span>Sign out</span> : null}
        </Button>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-svh min-w-0 flex-1 flex-col">
          <ApiHealthDot className="absolute right-4 top-4 z-10" />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
