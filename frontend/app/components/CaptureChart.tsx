"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { ChartDataPoint } from "@/app/lib/chartData";

const CHART_W = 820;
const CHART_H = 220;

export interface CaptureChartHandle {
  captureToBase64: () => Promise<string | null>;
}

interface CaptureChartProps {
  data: ChartDataPoint[];
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

export const CaptureChart = forwardRef<CaptureChartHandle, CaptureChartProps>(
  ({ data }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      async captureToBase64() {
        const el = containerRef.current;
        if (!el || data.length < 2) return null;
        try {
          const { toPng } = await import("html-to-image");
          const dataUrl = await toPng(el, {
            backgroundColor: "#FFFFFF",
            pixelRatio: 2,
            skipFonts: true,
            width: CHART_W,
            height: CHART_H,
          });
          return dataUrl;
        } catch (e) {
          console.warn("html-to-image capture failed, falling back to SVG:", e);
          return null;
        }
      },
    }));

    if (data.length < 2) return null;

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

    return (
      <div
        style={{
          position: "fixed",
          top: "-9999px",
          left: 0,
          width: CHART_W,
          height: CHART_H,
          background: "#FFFFFF",
          pointerEvents: "none",
          zIndex: -1,
        }}
        ref={containerRef}
      >
        <div
          style={{
            width: CHART_W,
            height: CHART_H,
            background: "#FFFFFF",
            border: "1px solid #CCCCCC",
            boxSizing: "border-box",
          }}
        >
          <AreaChart
            width={CHART_W}
            height={CHART_H}
            data={pts}
            margin={{ top: 18, right: 22, bottom: 10, left: 12 }}
          >
            <defs>
              <linearGradient id="capGradBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#008000" stopOpacity={0.30} />
                <stop offset="55%"  stopColor="#008000" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#008000" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="capGradDD" x1="0" y1="0" x2="0" y2="1">
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

            <Area
              type="monotone"
              dataKey="peakBalance"
              stroke="none"
              fill="url(#capGradDD)"
              isAnimationActive={false}
            />

            <Area
              type="monotone"
              dataKey="balance"
              stroke="#008000"
              strokeWidth={1.5}
              fill="url(#capGradBalance)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </div>
      </div>
    );
  }
);

CaptureChart.displayName = "CaptureChart";
