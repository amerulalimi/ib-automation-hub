"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, HeartPulse } from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export default function StatusPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/health`);
      const data = await res.json();
      setStatus(data.status ?? "unknown");
      setMsg(data.message ?? JSON.stringify(data));
    } catch (e) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : "Failed to reach backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HeartPulse className="h-6 w-6" />
            System status
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live read from <code className="text-xs">GET /health</code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Backend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {status && (
            <p className="text-sm">
              Status: <span className="font-mono">{status}</span>
            </p>
          )}
          {msg && (
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">{msg}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
