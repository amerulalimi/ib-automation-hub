"use client";

import { useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  ArrowRight,
  ArrowLeft,
  FileText,
  AlertCircle,
  RefreshCw,
  ImageDown,
} from "lucide-react";

import { FileUploader } from "@/app/components/FileUploader";
import { AccountInfoForm } from "@/app/components/AccountInfoForm";
import { DataPreview } from "@/app/components/DataPreview";
import { StepIndicator } from "@/app/components/StepIndicator";
import { CaptureChart, type CaptureChartHandle } from "@/app/components/CaptureChart";

import { parseExcelFile, parseCsvFile } from "@/app/lib/parseExcel";
import { generateMT5HTML } from "@/app/lib/generateHTML";
import { prepareChartData } from "@/app/lib/chartData";
import type { AccountInfo, ParsedReport } from "@/app/lib/types";

const STEPS = [
  { id: 1, label: "Muat Naik Fail" },
  { id: 2, label: "Info Akaun" },
  { id: 3, label: "Pratonton" },
  { id: 4, label: "Muat Turun" },
];

function getNowMT5Date(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default function GenerateReportPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [accountInfo, setAccountInfo] = useState<AccountInfo>({
    name: "",
    account: "",
    company: "",
    date: getNowMT5Date(),
  });

  const captureRef = useRef<CaptureChartHandle>(null);

  const handleFileParsed = useCallback(
    async (buffer: ArrayBuffer, name: string, ext: string) => {
      setIsProcessing(true);
      setParseError(null);

      try {
        let parsed: ParsedReport;
        if (ext === "csv") {
          const text = new TextDecoder().decode(buffer);
          parsed = parseCsvFile(text);
        } else {
          parsed = parseExcelFile(buffer);
        }

        if (parsed.positions.length === 0 && parsed.deals.length === 0) {
          setParseError(
            "Tiada data ditemui dalam fail. Sila pastikan fail mempunyai header yang betul (Time, Symbol, Profit, dll.)."
          );
          return;
        }

        setReport(parsed);
        setFileName(name.replace(/\.[^/.]+$/, ""));
        setCurrentStep(2);
      } catch (err) {
        setParseError(
          `Gagal memproses fail: ${err instanceof Error ? err.message : "Ralat tidak diketahui"}`
        );
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const handleDownload = useCallback(async () => {
    if (!report) return;
    setIsCapturing(true);

    let chartBase64: string | null = null;
    try {
      chartBase64 = (await captureRef.current?.captureToBase64()) ?? null;
    } catch {
      // Capture failed — generateMT5HTML will fall back to inline SVG
    }

    const htmlContent = generateMT5HTML(
      accountInfo,
      report.positions,
      report.deals,
      report.orders,
      report.summary,
      report.results,
      chartBase64,
      false
    );

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (accountInfo.name || fileName || "Report").replace(/\s+/g, "_");
    a.href = url;
    a.download = `TradeHistory-${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsCapturing(false);
    setCurrentStep(4);
  }, [report, accountInfo, fileName]);

  const handleReset = () => {
    setCurrentStep(1);
    setReport(null);
    setParseError(null);
    setFileName("");
    setAccountInfo({
      name: "",
      account: "",
      company: "",
      date: getNowMT5Date(),
    });
  };

  const canProceedStep2 = accountInfo.name.trim() !== "" && accountInfo.account.trim() !== "";
  const progressValue = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Generate Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload fail Excel/CSV dan jana laporan HTML (MT5-style).
          </p>
        </div>
        {currentStep > 1 && (
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Card>
          <CardContent className="pt-6 pb-4">
            <StepIndicator steps={STEPS} currentStep={currentStep} />
            <Progress value={progressValue} className="mt-4 h-1.5" />
          </CardContent>
        </Card>

        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  1
                </span>
                Muat Naik Fail Excel / CSV
              </CardTitle>
              <CardDescription>
                Muat naik fail eksport dari MT5 atau fail data dagangan anda. Sistem akan
                mengesan header secara automatik.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileUploader onFileParsed={handleFileParsed} isProcessing={isProcessing} />

              {isProcessing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Sedang memproses fail...
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                  <p className="text-sm text-destructive">{parseError}</p>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Format Header Yang Disokong
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <span className="font-medium text-foreground">Positions Sheet:</span>
                    <p className="mt-0.5">Time, Position, Symbol, Type, Volume, Price, S/L, T/P, Close Time, Close Price, Commission, Swap, Profit</p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Deals Sheet:</span>
                    <p className="mt-0.5">Time, Deal, Symbol, Type, Direction, Volume, Price, Order, Commission, Fee, Swap, Profit, Balance, Comment</p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Petua:</span>
                    <p className="mt-0.5">Nama sheet boleh &quot;Positions&quot;, &quot;Deals&quot;, atau sebarang nama — sistem akan mengesan secara automatik.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && report && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  2
                </span>
                Maklumat Akaun
              </CardTitle>
              <CardDescription>
                Isikan maklumat akaun yang akan dipaparkan dalam laporan HTML.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{report.positions.length} Positions</Badge>
                <Badge variant="secondary">{report.deals.length} Deals</Badge>
                <Badge variant="secondary">{report.orders.length} Orders</Badge>
                <Badge variant="outline">Balance: {report.summary.balance}</Badge>
                <Badge variant="outline" className="text-foreground">
                  Net P/L: {report.results.totalNetProfit}
                </Badge>
              </div>

              <AccountInfoForm value={accountInfo} onChange={setAccountInfo} />

              <Separator />

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Kembali
                </Button>
                <Button
                  onClick={() => setCurrentStep(3)}
                  disabled={!canProceedStep2}
                  className="gap-2"
                >
                  Seterusnya
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && report && (
          <>
            <CaptureChart
              ref={captureRef}
              data={prepareChartData(report.deals, report.positions)}
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                    3
                  </span>
                  Pratonton Data
                </CardTitle>
                <CardDescription>
                  Semak data yang telah diproses sebelum menjana laporan HTML.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <span className="text-xs text-muted-foreground block">Nama</span>
                    <span className="font-medium">{accountInfo.name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Akaun</span>
                    <span className="font-medium text-xs">{accountInfo.account || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Syarikat</span>
                    <span className="font-medium">{accountInfo.company || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Tarikh</span>
                    <span className="font-medium">{accountInfo.date || "—"}</span>
                  </div>
                </div>

                <DataPreview report={report} />

                <Separator />

                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(2)}
                    className="gap-2"
                    disabled={isCapturing}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>

                  <Button
                    onClick={handleDownload}
                    disabled={isCapturing}
                    className="gap-2 min-w-[210px]"
                  >
                    {isCapturing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Menjana imej graf...
                      </>
                    ) : (
                      <>
                        <ImageDown className="h-4 w-4" />
                        Jana &amp; Muat Turun HTML
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {currentStep === 4 && (
          <Card>
            <CardContent className="pt-12 pb-10 flex flex-col items-center text-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <FileText className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Laporan Berjaya Dijana!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fail HTML telah dimuat turun ke komputer anda. Buka fail tersebut dalam
                  browser untuk melihat laporan MT5.
                </p>
              </div>

              {report && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 w-full max-w-lg mt-2">
                  <StatBox label="Positions" value={report.positions.length.toString()} />
                  <StatBox label="Deals" value={report.deals.length.toString()} />
                  <StatBox label="Orders" value={report.orders.length.toString()} />
                  <StatBox label="Net Profit" value={report.results.totalNetProfit} />
                  <StatBox label="Balance" value={report.summary.balance} />
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <Button variant="outline" onClick={() => setCurrentStep(3)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Kembali
                </Button>
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  disabled={isCapturing}
                  className="gap-2"
                >
                  {isCapturing ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Muat Turun Semula
                </Button>
                <Button onClick={handleReset} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Laporan Baru
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
