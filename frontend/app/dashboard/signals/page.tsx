"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ScrollText,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

interface SignalLog {
  id: string;
  status: string;
  error: string | null;
  sent_at: string;
  channel: { id: string; name: string };
}

interface Signal {
  id: string;
  symbol: string;
  type: string;
  entry: number;
  sl: number;
  tp: number;
  action: string;
  received_at: string;
  logs: SignalLog[];
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const LIMIT = 15;

  const fetchSignals = useCallback(
    async (p: number, silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(`${BACKEND}/api/signals?page=${p}&limit=${LIMIT}`, { credentials: "include" });
        const data = await res.json();
        setSignals(data.signals ?? []);
        setTotal(data.total ?? 0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchSignals(page);
  }, [page, fetchSignals]);

  const totalPages = Math.ceil(total / LIMIT);

  function getOverallStatus(logs: SignalLog[]) {
    if (logs.length === 0) return "no-channels";
    if (logs.every((l) => l.status === "SENT")) return "sent";
    if (logs.every((l) => l.status === "FAILED")) return "failed";
    return "partial";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Signal Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All signals received from MT5 — {total} total
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => fetchSignals(page, true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            Received Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : signals.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No signals received yet.
            </div>
          ) : (
            <div className="space-y-2">
              {signals.map((signal) => {
                const status = getOverallStatus(signal.logs);
                const isExpanded = expandedId === signal.id;
                const isBuy = signal.type === "BUY";

                return (
                  <div key={signal.id} className="rounded-lg border border-border overflow-hidden">
                    <button
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedId((prev) => (prev === signal.id ? null : signal.id))}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isBuy ? "bg-emerald-400/10" : "bg-red-400/10"}`}>
                        {isBuy ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{signal.type} {signal.symbol}</span>
                          <Badge variant={signal.action === "OPEN" ? "default" : "secondary"} className="text-xs">{signal.action}</Badge>
                          <StatusBadge status={status} count={signal.logs.length} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          Entry: {signal.entry} · SL: {signal.sl} · TP: {signal.tp}
                        </p>
                      </div>

                      <time className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                        {new Date(signal.received_at).toLocaleString()}
                      </time>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border bg-muted/10 px-4 py-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Delivery Logs</p>
                        {signal.logs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No channels were active at the time of this signal.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {signal.logs.map((log) => (
                              <div key={log.id} className="flex items-center gap-2 text-xs">
                                {log.status === "SENT" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                                <span className="font-medium">{log.channel.name}</span>
                                <span className={log.status === "SENT" ? "text-emerald-400" : "text-destructive"}>{log.status}</span>
                                {log.error && <span className="text-muted-foreground truncate">— {log.error}</span>}
                                <span className="ml-auto text-muted-foreground">{new Date(log.sent_at).toLocaleTimeString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status, count }: { status: string; count: number }) {
  if (status === "no-channels") return <Badge variant="outline" className="text-xs">No channels</Badge>;
  if (status === "sent") return <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">Sent to {count}</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="text-xs">Failed ({count})</Badge>;
  return <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-400">Partial</Badge>;
}
