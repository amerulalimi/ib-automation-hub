"use client";

import {
  Area,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ChartDataPoint, DrawdownStats } from "@/app/lib/chartData";

interface BalanceChartProps {
  data: ChartDataPoint[];
  stats: DrawdownStats;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "#FFFEF0",
        border: "1px solid #999999",
        padding: "5px 9px",
        fontFamily: "Tahoma, Arial, sans-serif",
        fontSize: "11px",
        lineHeight: "1.65",
        boxShadow: "1px 1px 3px rgba(0,0,0,.20)",
        minWidth: 152,
      }}
    >
      <p style={{ margin: 0, fontWeight: "bold", color: "#222" }}>
        Ticket #{p.deal}
      </p>
      <p style={{ margin: 0, color: "#008000" }}>
        Balance: <b>{p.balance.toFixed(2)}</b>
      </p>
      <p style={{ margin: 0, color: p.profit >= 0 ? "#008000" : "#CC0000" }}>
        Profit:{" "}
        <b>
          {p.profit >= 0 ? "+" : ""}
          {p.profit.toFixed(2)}
        </b>
      </p>
      <p style={{ margin: 0, color: "#444" }}>
        Cumulative: <b>{p.cumProfit >= 0 ? "+" : ""}{p.cumProfit.toFixed(2)}</b>
      </p>
      {p.drawdown > 0.001 && (
        <p style={{ margin: "2px 0 0", color: "#CC0000", borderTop: "1px solid #DDDDDD", paddingTop: 2 }}>
          Drawdown: <b>-{p.drawdown.toFixed(2)}</b> ({p.drawdownPct.toFixed(2)}%)
        </p>
      )}
    </div>
  );
}

function YTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  if (x === undefined || y === undefined || !payload) return null;
  return (
    <text
      x={x} y={y} dy={4} textAnchor="end"
      fontFamily="Tahoma,Arial" fontSize={10} fill="#808080"
    >
      {payload.value.toFixed(2)}
    </text>
  );
}

function DrawdownPanel({ stats }: { stats: DrawdownStats }) {
  return (
    <div
      style={{
        marginTop: 8,
        border: "1px solid #D0D0D0",
        background: "#F8F8F8",
        padding: "8px 14px",
        fontFamily: "Tahoma, Arial, sans-serif",
        fontSize: "11px",
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontWeight: "bold",
          fontSize: "11px",
          color: "#333",
          borderBottom: "1px solid #D0D0D0",
          paddingBottom: 4,
        }}
      >
        Drawdown Analysis
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Max Drawdown"   value={`-${stats.maxDrawdown.toFixed(2)}`}    red />
        <Stat label="Max DD %"       value={`-${stats.maxDrawdownPct.toFixed(2)}%`} red />
        <Stat label="Peak Balance"   value={stats.maxDrawdownFrom.toFixed(2)} />
        <Stat label="Trough Balance" value={stats.maxDrawdownTo.toFixed(2)} />
        <Stat label="Current DD"     value={`-${stats.currentDrawdown.toFixed(2)}`}    red={stats.currentDrawdown > 0.001} />
        <Stat label="Current DD %"   value={`-${stats.currentDrawdownPct.toFixed(2)}%`} red={stats.currentDrawdown > 0.001} />
      </div>
    </div>
  );
}

function Stat({ label, value, red = false }: { label: string; value: string; red?: boolean }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10, color: "#888" }}>{label}</p>
      <p style={{ margin: 0, fontWeight: "bold", color: red ? "#CC0000" : "#222" }}>
        {value}
      </p>
    </div>
  );
}

export function BalanceChart({ data, stats }: BalanceChartProps) {
  if (data.length < 2) {
    return (
      <div
        style={{
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #D0D0D0",
          background: "#FAFAFA",
          fontFamily: "Tahoma, Arial, sans-serif",
          fontSize: 12,
          color: "#888",
        }}
      >
        Insufficient data to render chart.
      </div>
    );
  }

  const MAX = 500;
  const step = data.length > MAX ? Math.ceil(data.length / MAX) : 1;
  const pts = step > 1
    ? data.filter((_, i) => i % step === 0 || i === data.length - 1)
    : data;

  const balances = pts.map((d) => d.balance);
  const yMin = Math.min(...balances);
  const yMax = Math.max(...balances);
  const pad  = (yMax - yMin) * 0.07 || 1;

  const xStep = Math.ceil(pts.length / 10);
  const xTicks = pts
    .filter((_, i) => i % xStep === 0 || i === pts.length - 1)
    .map((d) => d.index);

  const showZero = yMin <= 0 && yMax >= 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
          fontFamily: "Tahoma, Arial, sans-serif",
          fontSize: 11,
          color: "#555",
        }}
      >
        <span style={{ fontWeight: "bold" }}>Equity / Balance Chart</span>
        <span style={{ display: "flex", gap: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ display: "inline-block", width: 24, height: 2, background: "#008000" }} />
            Balance
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ display: "inline-block", width: 24, height: 12, background: "rgba(0,128,0,0.18)" }} />
            Area Fill
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ display: "inline-block", width: 24, height: 12, background: "rgba(204,0,0,0.14)" }} />
            Drawdown Zone
          </span>
        </span>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #CCCCCC",
          overflow: "hidden",
        }}
      >
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={pts} margin={{ top: 18, right: 22, bottom: 10, left: 12 }}>

            <defs>
              <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#008000" stopOpacity={0.30} />
                <stop offset="55%"  stopColor="#008000" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#008000" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="gradDD" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#CC0000" stopOpacity={0.20} />
                <stop offset="100%" stopColor="#CC0000" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="#E8E8E8"
              strokeWidth={0.5}
              horizontal
              vertical={false}
            />

            <XAxis
              dataKey="index"
              ticks={xTicks}
              tickFormatter={(idx: number) => {
                const found = pts.find((d) => d.index === idx);
                return found ? String(found.deal).substring(0, 9) : "";
              }}
              tick={{ fontFamily: "Tahoma,Arial", fontSize: 9, fill: "#808080" }}
              axisLine={{ stroke: "#A0A0A0", strokeWidth: 1 }}
              tickLine={{ stroke: "#A0A0A0", strokeWidth: 0.5 }}
            />

            <YAxis
              domain={[yMin - pad, yMax + pad]}
              tick={<YTick />}
              axisLine={{ stroke: "#A0A0A0", strokeWidth: 1 }}
              tickLine={false}
              width={68}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "#AAAAAA", strokeWidth: 1, strokeDasharray: "4 3" }}
            />

            {showZero && (
              <ReferenceLine y={0} stroke="#BBBBBB" strokeDasharray="4 3" strokeWidth={1} />
            )}

            <Area
              type="monotone"
              dataKey="peakBalance"
              stroke="none"
              fill="url(#gradDD)"
              isAnimationActive={false}
              legendType="none"
            />

            <Area
              type="monotone"
              dataKey="balance"
              stroke="#008000"
              strokeWidth={1.5}
              fill="url(#gradBalance)"
              dot={false}
              activeDot={{ r: 4, stroke: "#008000", strokeWidth: 2, fill: "#fff" }}
              isAnimationActive={false}
            />

          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <DrawdownPanel stats={stats} />
    </div>
  );
}
