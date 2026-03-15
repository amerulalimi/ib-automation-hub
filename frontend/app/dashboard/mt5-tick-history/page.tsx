"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, Search, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"];

function defaultDateFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MT5TickHistoryPage() {
  const [loading, setLoading] = useState(false);
  const [symbolsList, setSymbolsList] = useState<string[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [timeframe, setTimeframe] = useState("H1");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [exporting, setExporting] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accountNo, setAccountNo] = useState("");
  const [mt5Password, setMt5Password] = useState("");
  const [brokerServer, setBrokerServer] = useState("");

  const fetchMetadata = async () => {
    if (!accountNo || !mt5Password || !brokerServer) {
      toast.error("Enter MT5 account number, password, and server name first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          account_no: accountNo,
          password: mt5Password,
          broker_server: brokerServer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail ?? data.message ?? "Failed to load metadata");
      }
      setSymbolsList(Array.isArray(data.symbols) ? data.symbols : []);
      if (data.timeframes && data.timeframes.length) {
        setTimeframe((prev) => (data.timeframes.includes(prev) ? prev : data.timeframes[0]));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MT5 not connected or metadata failed";
      setError(msg);
      toast.error(msg);
      setSymbolsList([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSymbols = useMemo(() => {
    if (!symbolSearch.trim()) return symbolsList;
    const q = symbolSearch.trim().toLowerCase();
    return symbolsList.filter((s) => s.toLowerCase().includes(q));
  }, [symbolsList, symbolSearch]);

  const selectAll = () => {
    if (filteredSymbols.length === 0) return;
    setSelectedSymbols((prev) => {
      const next = new Set(prev);
      filteredSymbols.forEach((s) => next.add(s));
      return next;
    });
  };

  const clearSelection = () => setSelectedSymbols(new Set());

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const handleDownload = async () => {
    if (!accountNo || !mt5Password || !brokerServer) {
      toast.error("Enter MT5 account number, password, and server name first.");
      return;
    }
    if (selectedSymbols.size === 0) {
      toast.error("Select at least one symbol.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          account_no: accountNo,
          password: mt5Password,
          broker_server: brokerServer,
          symbols: Array.from(selectedSymbols),
          timeframe,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? data.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
        `MT5_Data_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">MT5 Candlestick Export</h1>
        <p className="text-muted-foreground mt-1">
          Export OHLC data from MetaTrader 5 for selected symbols and date range using your MT5 account.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Export settings</CardTitle>
          <CardDescription>
            Enter your MT5 login details, then load symbols, select timeframe and dates, and download Excel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* MT5 login */}
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">MT5 Login</p>
                <p className="text-xs text-muted-foreground">
                  Credentials are kept only in this browser session and sent directly to your local backend.
                </p>
              </div>
              <Button type="button" size="sm" onClick={fetchMetadata} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect & Load Symbols"
                )}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="mt5Account">Account Number</Label>
                <Input
                  id="mt5Account"
                  type="number"
                  inputMode="numeric"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  placeholder="e.g. 12345678"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt5Password">Password</Label>
                <Input
                  id="mt5Password"
                  type="password"
                  value={mt5Password}
                  onChange={(e) => setMt5Password(e.target.value)}
                  placeholder="MT5 password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt5Server">Server Name</Label>
                <Input
                  id="mt5Server"
                  type="text"
                  value={brokerServer}
                  onChange={(e) => setBrokerServer(e.target.value)}
                  placeholder="e.g. Exness-Real2 or ICMarkets-Demo"
                />
              </div>
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={fetchMetadata}
              >
                Retry connection
              </Button>
            </div>
          )}

          {/* Timeframe */}
          <div className="space-y-2">
            <Label htmlFor="timeframe">Timeframe</Label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">From date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">To date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Symbols: searchable multi-select */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Symbols</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading symbols from MT5…</span>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search symbols…"
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2">
                  {filteredSymbols.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {symbolsList.length === 0
                        ? "No symbols. Check MT5 connection."
                        : "No symbols match your search."}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {filteredSymbols.map((symbol) => {
                        const isSelected = selectedSymbols.has(symbol);
                        return (
                          <li key={symbol}>
                            <button
                              type="button"
                              onClick={() => toggleSymbol(symbol)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-primary" />
                              ) : (
                                <Square className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-mono">{symbol}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {selectedSymbols.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedSymbols.size} symbol{selectedSymbols.size !== 1 ? "s" : ""} selected
                  </p>
                )}
              </>
            )}
          </div>

          {/* Download */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button
              onClick={handleDownload}
              disabled={
                exporting ||
                loading ||
                selectedSymbols.size === 0 ||
                !accountNo ||
                !mt5Password ||
                !brokerServer
              }
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing export…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Excel
                </>
              )}
            </Button>
            {selectedSymbols.size > 0 && (
              <Badge variant="secondary">
                {selectedSymbols.size} symbol{selectedSymbols.size !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
