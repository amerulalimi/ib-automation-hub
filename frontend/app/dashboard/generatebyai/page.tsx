"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

interface ReportParams {
  symbol: string;
  profit_percent: number;
  target_profit: number;
  start_deposit: number;
  max_rows: number;
  days_back: number;
  date_from: string;
  date_to: string;
  has_withdrawal: boolean;
  is_dummy: boolean;
}

interface Trade {
  ticket: number;
  open_time: string;
  symbol: string;
  type: string;
  volume: number;
  open_price: number;
  sl: number;
  tp: number;
  close_time: string;
  close_price: number;
  commission: number;
  swap: number;
  profit: number;
}

interface ReportResponse {
  status: string;
  source: "dummy" | "mt5_live";
  params: ReportParams;
  trades: Trade[];
  html: string;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

const LOADING_STEPS = [
  { ms: 0, label: "Menghantar parameter laporan..." },
  { ms: 1000, label: "Mengira sasaran profit..." },
  { ms: 2200, label: "Menjana data trade..." },
  { ms: 3400, label: "Membina laporan HTML..." },
];

export default function GenerateByAIPage() {
  const [broker, setBroker] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [symbol, setSymbol] = useState("XAUUSD");
  const [profitPercent, setProfitPercent] = useState("10");
  const [startDeposit, setStartDeposit] = useState("1000");
  const [maxRows, setMaxRows] = useState("10");
  const [dateFrom, setDateFrom] = useState(monthAgoStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [hasWithdrawal, setHasWithdrawal] = useState(false);
  const [withdrawalAmt, setWithdrawalAmt] = useState("0");
  const [isDummy, setIsDummy] = useState(true);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !reportHtml) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(reportHtml);
    doc.close();
  }, [reportHtml]);

  const clearStepTimers = () => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
  };

  const handleGenerate = async () => {
    if (!broker.trim() || !accountNo.trim()) {
      setError("Sila isi Nama Broker dan No. Akaun.");
      return;
    }
    const deposit = parseFloat(startDeposit);
    const pct = parseFloat(profitPercent);
    if (isNaN(deposit) || deposit <= 0) {
      setError("Deposit permulaan mestilah nombor positif.");
      return;
    }
    if (isNaN(pct) || pct <= 0) {
      setError("% Profit mestilah nombor positif.");
      return;
    }
    if (!dateFrom || !dateTo || dateFrom >= dateTo) {
      setError("Tarikh 'Dari' mestilah lebih awal daripada tarikh 'Hingga'.");
      return;
    }

    setLoading(true);
    setError(null);
    setReportHtml(null);
    setReportData(null);
    clearStepTimers();

    LOADING_STEPS.forEach(({ ms, label }) => {
      const t = setTimeout(() => setLoadingStep(label), ms);
      stepTimers.current.push(t);
    });

    try {
      const res = await fetch(`${BACKEND}/generate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: broker.trim(),
          account_no: accountNo.trim(),
          start_deposit: deposit,
          profit_percent: pct,
          symbol: symbol === "MIXED" ? "" : symbol,
          max_rows: parseInt(maxRows) || 10,
          date_from: dateFrom,
          date_to: dateTo,
          has_withdrawal: hasWithdrawal,
          withdrawal_amount: hasWithdrawal ? parseFloat(withdrawalAmt) || 0 : 0,
          is_dummy: isDummy,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Ralat tidak diketahui dari server." }));
        throw new Error(err.detail ?? "Gagal menjana laporan.");
      }

      const data: ReportResponse = await res.json();
      setReportData(data);
      setReportHtml(data.html);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Gagal menghubungi backend. Pastikan server FastAPI berjalan."
      );
    } finally {
      clearStepTimers();
      setLoadingStep("");
      setLoading(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!reportHtml) return;
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MT5_Report_${accountNo}_${date}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const trades = reportData?.trades ?? [];
  const totalProfit = trades.reduce((s, t) => s + t.profit, 0);
  const winCount = trades.filter((t) => t.profit > 0).length;
  const winRate = trades.length > 0 ? ((winCount / trades.length) * 100).toFixed(1) : "0";
  const finalBalance =
    parseFloat(startDeposit || "0") +
    totalProfit -
    (hasWithdrawal ? parseFloat(withdrawalAmt) || 0 : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Generate Using AI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Isi parameter dan jana laporan melalui AI/backend (dummy atau MT5 live).
        </p>
      </div>

      <main className="space-y-6">
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-blue-500" />
              Maklumat Akaun
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Nama Broker</label>
                <input
                  type="text"
                  value={broker}
                  onChange={(e) => setBroker(e.target.value)}
                  placeholder="Contoh: Exness, ICMarkets, XM"
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">No. Akaun</label>
                <input
                  type="text"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  placeholder="Contoh: 12345678"
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-2">Mod Data</label>
              <div className="flex rounded-xl overflow-hidden border border-border">
                <button
                  type="button"
                  onClick={() => setIsDummy(true)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition ${
                    isDummy ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Demo / Dummy
                </button>
                <button
                  type="button"
                  onClick={() => setIsDummy(false)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition ${
                    !isDummy ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  MT5 Live
                </button>
              </div>
              {!isDummy && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  Pastikan MetaTrader5 terminal dibuka dan anda sudah log masuk.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Simbol Trading</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="MIXED">Pelbagai Simbol</option>
                <option value="XAUUSD">XAUUSD — Gold</option>
                <option value="EURUSD">EURUSD — Euro/Dollar</option>
                <option value="GBPUSD">GBPUSD — Pound/Dollar</option>
                <option value="USDJPY">USDJPY — Dollar/Yen</option>
                <option value="XAGUSD">XAGUSD — Silver</option>
              </select>
            </div>
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-violet-500" />
              Parameter Laporan
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Deposit Permulaan (USD)</label>
                <input
                  type="number"
                  value={startDeposit}
                  onChange={(e) => setStartDeposit(e.target.value)}
                  placeholder="1000.00"
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">% Profit Keseluruhan</label>
                <div className="relative">
                  <input
                    type="number"
                    value={profitPercent}
                    onChange={(e) => setProfitPercent(e.target.value)}
                    placeholder="15"
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 pr-8 text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                {startDeposit && profitPercent && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                    = ${((parseFloat(startDeposit || "0") * parseFloat(profitPercent || "0")) / 100).toFixed(2)} profit
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Tarikh Dari</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Tarikh Hingga</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Jumlah Trade</label>
                <select
                  value={maxRows}
                  onChange={(e) => setMaxRows(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {[5, 8, 10, 15, 20, 25, 30, 40, 50].map((n) => (
                    <option key={n} value={n}>
                      {n} trade
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Pernah Withdraw?</label>
                <div className="flex rounded-xl overflow-hidden border border-border">
                  <button
                    type="button"
                    onClick={() => setHasWithdrawal(false)}
                    className={`flex-1 py-2.5 text-xs font-semibold transition ${
                      !hasWithdrawal ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tidak
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasWithdrawal(true)}
                    className={`flex-1 py-2.5 text-xs font-semibold transition ${
                      hasWithdrawal ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Ya
                  </button>
                </div>
              </div>
            </div>

            {hasWithdrawal && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Jumlah Withdraw (USD)</label>
                <input
                  type="number"
                  value={withdrawalAmt}
                  onChange={(e) => setWithdrawalAmt(e.target.value)}
                  placeholder="200.00"
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {loadingStep || "Memproses..."}
                  </span>
                ) : (
                  "Generate Report"
                )}
              </Button>
              {reportHtml && (
                <Button variant="secondary" onClick={handleDownloadHtml} className="flex-1">
                  Download .html
                </Button>
              )}
            </div>

            {error && (
              <div className="flex gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm px-4 py-3">
                <span className="shrink-0 font-bold">⚠</span>
                <span>{error}</span>
              </div>
            )}
          </div>
        </section>

        {reportData && (
          <section className="rounded-2xl border border-border bg-card px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mr-2">
                Parameter:
              </span>
              <Badge variant="secondary">Simbol: {reportData.params.symbol || "MIXED"}</Badge>
              <Badge variant="secondary">Deposit: ${reportData.params.start_deposit.toFixed(2)}</Badge>
              <Badge variant="secondary">
                Profit: {reportData.params.profit_percent}% (${reportData.params.target_profit.toFixed(2)})
              </Badge>
              <Badge variant="secondary">Trade: {reportData.params.max_rows}</Badge>
              <Badge variant="outline">
                {reportData.params.date_from} → {reportData.params.date_to}
              </Badge>
              <Badge variant="outline">{reportData.params.is_dummy ? "Demo" : "MT5 Live"}</Badge>
            </div>
          </section>
        )}

        {reportData && trades.length > 0 && (
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Jumlah Trade</p>
              <p className="text-xl font-bold mt-1.5">{trades.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Profit</p>
              <p className={`text-xl font-bold mt-1.5 ${totalProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                ${totalProfit.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Baki Akhir</p>
              <p className="text-xl font-bold mt-1.5 text-sky-500">${finalBalance.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Win</p>
              <p className="text-xl font-bold mt-1.5 text-emerald-500">{winCount} trade</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Win Rate</p>
              <p className={`text-xl font-bold mt-1.5 ${parseFloat(winRate) >= 50 ? "text-emerald-500" : "text-amber-500"}`}>
                {winRate}%
              </p>
            </div>
          </section>
        )}

        {reportHtml && (
          <section className="rounded-2xl overflow-hidden border border-border shadow-xl">
            <div className="bg-muted px-5 py-3 flex items-center justify-between border-b border-border">
              <span className="text-sm font-medium text-muted-foreground">Preview — MT5 Trade History Report</span>
              <div className="flex items-center gap-2">
                <Badge variant={reportData?.source === "dummy" ? "secondary" : "default"}>
                  {reportData?.source === "dummy" ? "Demo" : "Live"}
                </Badge>
                <span className="text-xs text-muted-foreground">{trades.length} trades</span>
              </div>
            </div>
            <iframe
              ref={iframeRef}
              title="MT5 Report Preview"
              className="w-full border-0 bg-white block"
              style={{ height: "640px" }}
            />
            <div className="bg-muted border-t border-border px-5 py-3 flex justify-between items-center">
              <p className="text-xs text-muted-foreground">Dijana pada {new Date().toLocaleString("ms-MY")}</p>
              <Button size="sm" onClick={handleDownloadHtml}>
                Muat Turun .html
              </Button>
            </div>
          </section>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative w-14 h-14">
              <span className="h-14 w-14 animate-spin rounded-full border-2 border-primary border-t-transparent block" />
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-primary">AI</span>
            </div>
            <p className="text-sm text-muted-foreground font-medium animate-pulse">{loadingStep}</p>
          </div>
        )}

        {!reportHtml && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center text-2xl">
              📊
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">Laporan belum dijana</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Isi maklumat akaun dan parameter laporan, kemudian klik <strong>Generate Report</strong>.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
