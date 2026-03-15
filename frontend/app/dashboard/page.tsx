"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Radio,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Activity,
  Clock,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

interface OverviewStats {
  totalSignals: number;
  totalChannels: number;
  activeChannels: number;
  sentLogs: number;
  failedLogs: number;
  recentSignals: RecentSignal[];
}

interface RecentSignal {
  id: string;
  symbol: string;
  type: string;
  action: string;
  entry: number;
  received_at: string;
  logs: { status: string }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [signalsRes, channelsRes] = await Promise.all([
          fetch(`${BACKEND}/api/signals?limit=5`, { credentials: "include" }),
          fetch(`${BACKEND}/api/channels`, { credentials: "include" }),
        ]);

        const { signals = [], total = 0 } = (await signalsRes.json().catch(() => ({}))) as {
          signals?: RecentSignal[];
          total?: number;
        };

        const rawChannels = await channelsRes.json().catch(() => []);
        const channels: Array<{ is_active?: boolean }> = Array.isArray(rawChannels) ? rawChannels : [];

        const activeChannels = channels.filter((c) => c.is_active).length;

        let sentLogs = 0;
        let failedLogs = 0;
        signals.forEach((s: RecentSignal) => {
          s.logs.forEach((l) => {
            if (l.status === "SENT") sentLogs++;
            else failedLogs++;
          });
        });

        setStats({
          totalSignals: total,
          totalChannels: channels.length,
          activeChannels,
          sentLogs,
          failedLogs,
          recentSignals: signals,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Signals",
      value: stats?.totalSignals ?? 0,
      icon: Activity,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Active Channels",
      value: `${stats?.activeChannels ?? 0} / ${stats?.totalChannels ?? 0}`,
      icon: Radio,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Messages Sent",
      value: stats?.sentLogs ?? 0,
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
    },
    {
      label: "Failed Deliveries",
      value: stats?.failedLogs ?? 0,
      icon: XCircle,
      color: "text-red-400",
      bg: "bg-red-400/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor your trade signal pipeline in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.recentSignals.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No signals received yet. Configure your MT5 EA to post to{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                POST {BACKEND}/api/signal
              </code>
              .
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentSignals.map((s) => {
                const allSent = s.logs.every((l) => l.status === "SENT");
                const hasFailed = s.logs.some((l) => l.status === "FAILED");
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="font-semibold text-sm">
                          {s.type} {s.symbol}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          @ {s.entry}
                        </span>
                      </div>
                      <Badge
                        variant={s.action === "OPEN" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {s.action}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.logs.length === 0 ? (
                        <Badge variant="outline" className="text-xs">
                          No channels
                        </Badge>
                      ) : hasFailed ? (
                        <Badge variant="destructive" className="text-xs">
                          Partial
                        </Badge>
                      ) : allSent ? (
                        <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                          Sent
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {new Date(s.received_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-5">
          <p className="text-sm font-semibold mb-3">MT5 EA Configuration</p>
          <div className="space-y-2 font-mono text-xs bg-muted rounded-lg p-4">
            <p>
              <span className="text-muted-foreground">Endpoint: </span>
              <span className="text-foreground">POST {BACKEND}/api/signal</span>
            </p>
            <p>
              <span className="text-muted-foreground">Header: </span>
              <span className="text-foreground">x-signal-key: YOUR_SECRET_KEY</span>
            </p>
            <p className="pt-1 border-t border-border text-muted-foreground">
              {`{ "Symbol":"GOLD","Type":"BUY","Entry":2035.50,"SL":2030.00,"TP":2045.00,"Action":"OPEN" }`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
