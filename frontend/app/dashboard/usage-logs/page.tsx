"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  Brain,
  History,
  Info,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

interface UsageLog {
  id: string;
  user_id: string | null;
  action_type: string;
  details: any;
  timestamp: string;
  user_email: string | null;
}

export default function UsageLogsPage() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const LIMIT = 20;

  const fetchLogs = useCallback(
    async (p: number, silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(`${BACKEND}/api/ai/usage-logs?page=${p}&limit=${LIMIT}`, { credentials: "include" });
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Activity Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            System movements, AI classification, and active sessions — {total} total
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => fetchLogs(page, true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            System Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No activity logs recorded yet.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Details</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <ActionIcon action={log.action_type} />
                          <span className="font-medium">{log.action_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top max-w-md">
                        <pre className="text-[11px] font-mono whitespace-pre-wrap line-clamp-3">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-muted-foreground">
                        {log.user_email || "System"}
                      </td>
                      <td className="px-4 py-3 align-top text-right whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

function ActionIcon({ action }: { action: string }) {
  if (action.includes("ai_")) return <Brain className="h-3.5 w-3.5 text-primary" />;
  if (action.includes("error")) return <Info className="h-3.5 w-3.5 text-destructive" />;
  return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
}
