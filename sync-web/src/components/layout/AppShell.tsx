import {
  CalendarClock,
  CalendarPlus,
  LogOut,
  MailCheck,
  User,
} from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { BrandLink } from "@/components/common/Brand";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Separator";
import { useCurrentUser, useSignOut } from "@/features/auth";
import { notify } from "@/lib/toast";
import { config } from "@/lib/config/env";
import { cn } from "@/lib/utils";
import { RealtimeStatusBadge } from "./RealtimeStatusBadge";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { to: "/dashboard", label: "Meetings", icon: CalendarClock },
  { to: "/invitations", label: "Invites", icon: MailCheck },
] as const;

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function AppShell() {
  const { user } = useCurrentUser();
  const signOut = useSignOut();

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <BrandLink to="/dashboard" />

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link to="/calls/new">
                <CalendarPlus aria-hidden="true" />
                New meeting
              </Link>
            </Button>

            <RealtimeStatusBadge />
            <ThemeToggle />

            {user ? (
              <span
                className="hidden items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 md:inline-flex"
                title={user.email}
              >
                <span
                  className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-semibold text-primary"
                  aria-hidden="true"
                >
                  {initials(user.name)}
                </span>
                <span className="max-w-32 truncate text-sm">{user.name}</span>
              </span>
            ) : (
              <User
                className="size-4 text-muted-foreground md:hidden"
                aria-hidden="true"
              />
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                signOut.mutate(undefined, {
                  // The cookie is HttpOnly, so only the server can end the
                  // session. If it did not, saying "signed out" would be false.
                  onError: error => {
                    notify.error(error);
                    notify.info(
                      "You are still signed in",
                      "Your session could not be ended.",
                    );
                  },
                })
              }
              loading={signOut.isPending}
              aria-label="Sign out"
            >
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8"
      >
        <Outlet />
      </main>

      <footer className="border-t border-border py-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>Made for meetings you actually want to be in.</p>
          <p>{config.appName}</p>
        </div>
      </footer>
    </div>
  );
}
