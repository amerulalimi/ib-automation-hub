"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Radio,
  ScrollText,
  LogOut,
  Zap,
  Menu,
  X,
  Calendar,
  Download,
  FileUp,
  Settings2,
  BookOpen,
  HeartPulse,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/generatereport", label: "Generate Report", icon: FileUp },
  { href: "/dashboard/generatebyai", label: "Generate Using AI", icon: Settings2 },
  { href: "/dashboard/channels", label: "Channels", icon: Radio },
  { href: "/dashboard/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/dashboard/content-calendar", label: "Content Calendar", icon: Calendar },
  { href: "/dashboard/signals", label: "Signal Logs", icon: ScrollText },
  { href: "/dashboard/usage-logs", label: "AI Activity Logs", icon: Settings2 },
  { href: "/dashboard/status", label: "System Status", icon: HeartPulse },
  { href: "/dashboard/admin", label: "Users & Roles", icon: Users },
  { href: "/dashboard/mt5-tick-history", label: "MT5 History Export", icon: Download },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const setProfile = useAuthStore((s) => s.setProfile);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/api/auth/me`, { credentials: "include" });
        if (!res.ok) throw new Error("unauth");
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) {
          setProfile(null);
          router.replace(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, setProfile]);

  const handleSignOut = async () => {
    try {
      await fetch(`${BACKEND}/api/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      router.push("/login");
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground flex">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-card border-r border-border transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:static lg:flex"
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Signal Bridge</p>
            <p className="text-xs text-muted-foreground">MT5 → Telegram</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-card border-b border-border lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Signal Bridge</span>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
