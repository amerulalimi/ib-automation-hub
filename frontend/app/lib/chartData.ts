import type { DealRow, PositionRow } from "./types";

export interface ChartDataPoint {
  index: number;
  balance: number;     // running balance at this trade
  deal: string;        // ticket / deal number for tooltip
  profit: number;      // profit of THIS trade
  cumProfit: number;   // cumulative profit since start
  drawdown: number;    // absolute drawdown from peak
  drawdownPct: number; // drawdown as % of peak
  peakBalance: number; // highest balance seen so far
}

export interface DrawdownStats {
  maxDrawdown: number;
  maxDrawdownPct: number;
  maxDrawdownFrom: number; // peak balance when max DD occurred
  maxDrawdownTo: number;   // trough balance when max DD occurred
  currentDrawdown: number;
  currentDrawdownPct: number;
}

// ─── Data preparation ────────────────────────────────────────────────────────
//
// Running Balance Logic (example):
//   Trade 1: Profit  $10 → Balance $1010   ← plotted
//   Trade 2: Profit  -$5 → Balance $1005   ← plotted
//   Trade 3: Profit  $20 → Balance $1025   ← plotted
//   Chart plots: [1010, 1005, 1025]
//
// Source A (Deals sheet)   : uses the pre-computed "Balance" column directly.
// Source B (Positions only): starts from 0 and accumulates each trade's profit.

export function prepareChartData(
  deals: DealRow[],
  positions: PositionRow[]
): ChartDataPoint[] {
  if (deals.length > 0) {
    // MT5 Deals export already contains the running Balance column.
    let peak = 0;
    let cumProfit = 0;
    const raw = deals.map((d, i) => {
      const bal = parseFloat(d.balance) || 0;
      const profit = parseFloat(d.profit) || 0;
      cumProfit += profit;
      if (bal > peak) peak = bal;
      const dd = Math.max(0, peak - bal);
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      return {
        index: i,
        balance: bal,
        deal: d.deal || String(i + 1),
        profit,
        cumProfit,
        drawdown: dd,
        drawdownPct: ddPct,
        peakBalance: peak,
      };
    });
    // Ignore rows with balance = 0 (balance-in entries usually have 0)
    return raw.filter((d) => d.balance > 0);
  }

  // Fallback: build cumulative running total from individual position profits.
  // Start from 0; each trade adds its profit to the running total.
  let running = 0;
  let peak = 0;
  return positions.map((p, i) => {
    const profit = parseFloat(p.profit) || 0;
    running += profit;                              // running total
    if (running > peak) peak = running;
    const dd = Math.max(0, peak - running);
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    return {
      index: i,
      balance: running,
      deal: p.position || String(i + 1),
      profit,
      cumProfit: running,
      drawdown: dd,
      drawdownPct: ddPct,
      peakBalance: peak,
    };
  });
}

export function calcDrawdownStats(data: ChartDataPoint[]): DrawdownStats {
  if (data.length === 0) {
    return {
      maxDrawdown: 0, maxDrawdownPct: 0,
      maxDrawdownFrom: 0, maxDrawdownTo: 0,
      currentDrawdown: 0, currentDrawdownPct: 0,
    };
  }
  let maxDD = 0, maxDDPct = 0, maxFrom = 0, maxTo = 0;
  for (const d of data) {
    if (d.drawdown > maxDD) {
      maxDD = d.drawdown;
      maxDDPct = d.drawdownPct;
      maxFrom = d.peakBalance;
      maxTo = d.balance;
    }
  }
  const last = data[data.length - 1];
  return {
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    maxDrawdownFrom: maxFrom,
    maxDrawdownTo: maxTo,
    currentDrawdown: last.drawdown,
    currentDrawdownPct: last.drawdownPct,
  };
}

// ─── SVG chart (fully static — embeds inline in the exported HTML) ────────────
//
// ✔  No JavaScript required — pure SVG paths & text
// ✔  100% offline-capable (no CDN, no external library)
// ✔  Gray area fill below the balance line (MT5 "Detailed Report" style)
// ✔  Dark green (#008000) balance line
// ✔  Gradient fade from green → transparent

const SVG_W = 820;
const SVG_H = 220;
const PAD = { top: 20, right: 22, bottom: 42, left: 74 };

function niceRange(rawMin: number, rawMax: number, ticks = 5) {
  const range = rawMax - rawMin || 1;
  const roughStep = range / ticks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const niceStep = Math.ceil(roughStep / magnitude) * magnitude;
  const niceMin = Math.floor(rawMin / niceStep) * niceStep;
  const niceMax = niceMin + niceStep * (ticks + 1);
  return { min: niceMin, max: niceMax };
}

// Subsample an array to at most `max` evenly spaced elements (always keeping last)
function subsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

export function generateBalanceChartSVG(data: ChartDataPoint[]): string {
  if (data.length < 2) return "";

  // Keep SVG path size reasonable (max 500 points)
  const pts = subsample(data, 500);

  const cW = SVG_W - PAD.left - PAD.right;
  const cH = SVG_H - PAD.top - PAD.bottom;

  const balances = pts.map((d) => d.balance);
  const rawMin = Math.min(...balances);
  const rawMax = Math.max(...balances);
  const { min: yMin, max: yMax } = niceRange(rawMin, rawMax, 5);
  const yRange = yMax - yMin || 1;

  const xScale = (i: number): number =>
    PAD.left + (i / Math.max(pts.length - 1, 1)) * cW;
  const yScale = (v: number): number =>
    PAD.top + cH - ((v - yMin) / yRange) * cH;

  const bottom = PAD.top + cH;   // y coordinate of x-axis

  // ── Grid lines + Y-axis labels ───────────────────────────────────────────
  const gridEl: string[] = [];
  const Y_TICKS = 5;
  for (let t = 0; t <= Y_TICKS; t++) {
    const v = yMin + (t / Y_TICKS) * yRange;
    const y = yScale(v).toFixed(1);
    gridEl.push(`<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + cW}" y2="${y}" stroke="#EBEBEB" stroke-width="0.5"/>`);
    gridEl.push(`<text x="${(PAD.left - 7).toFixed(0)}" y="${(+y + 3.5).toFixed(1)}" font-family="Tahoma,Arial" font-size="9" fill="#808080" text-anchor="end">${v.toFixed(2)}</text>`);
  }

  // ── X-axis labels (max 12 ticks, show deal/ticket numbers) ───────────────
  const xEl: string[] = [];
  const xSampled = subsample(pts, 12);
  xSampled.forEach((d) => {
    const x = xScale(pts.indexOf(d)).toFixed(1);
    xEl.push(`<line x1="${x}" y1="${bottom}" x2="${x}" y2="${bottom + 4}" stroke="#B0B0B0" stroke-width="0.5"/>`);
    xEl.push(`<text x="${x}" y="${bottom + 16}" font-family="Tahoma,Arial" font-size="8" fill="#808080" text-anchor="middle">${String(d.deal).substring(0, 9)}</text>`);
  });

  // ── Area fill path (balance line → x-axis → back to start) ──────────────
  //
  // This creates the gray/green filled area BELOW the balance line.
  // Path: M[x0,y0] L[x1,y1] ... L[xn,yn]   ← trace along balance line
  //       L[xn, bottom] L[x0, bottom] Z      ← drop to axis & close
  const areaPts: string[] = pts.map((d, i) => {
    const x = xScale(i).toFixed(1);
    const y = yScale(d.balance).toFixed(1);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  });
  const xFirst = xScale(0).toFixed(1);
  const xLast  = xScale(pts.length - 1).toFixed(1);
  areaPts.push(`L${xLast},${bottom.toFixed(1)}`);
  areaPts.push(`L${xFirst},${bottom.toFixed(1)}`);
  areaPts.push("Z");

  // ── Balance line path ────────────────────────────────────────────────────
  const linePts = pts.map((d, i) => {
    const x = xScale(i).toFixed(1);
    const y = yScale(d.balance).toFixed(1);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  });

  // ── Drawdown area path (between peak line and balance line) ──────────────
  // Top edge: trace peak balances; bottom edge: trace balance line backwards.
  const ddTop = pts.map((d, i) => {
    const x = xScale(i).toFixed(1);
    const y = yScale(d.peakBalance).toFixed(1);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  });
  const ddBottom = pts.slice().reverse().map((d, i, arr) => {
    const origIdx = pts.length - 1 - i;
    const x = xScale(origIdx).toFixed(1);
    const y = yScale(d.balance).toFixed(1);
    return `L${x},${y}`;
  });
  const ddPath = [...ddTop, ...ddBottom, "Z"].join(" ");

  const clipId  = "bc";
  const gradId  = "bg";
  const ddGradId = "dg";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" style="font-family:Tahoma,Arial;display:block;background:#FFFFFF;">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${PAD.left}" y="${PAD.top}" width="${cW}" height="${cH}"/>
    </clipPath>
    <!-- Green gradient fill below the balance line (MT5 "Detailed Report" style) -->
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#008000" stop-opacity="0.28"/>
      <stop offset="60%"  stop-color="#008000" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#008000" stop-opacity="0.01"/>
    </linearGradient>
    <!-- Red gradient for drawdown zone -->
    <linearGradient id="${ddGradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#CC0000" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#CC0000" stop-opacity="0.04"/>
    </linearGradient>
  </defs>

  <!-- Chart background -->
  <rect x="${PAD.left}" y="${PAD.top}" width="${cW}" height="${cH}" fill="#FFFFFF" stroke="#D8D8D8" stroke-width="1"/>

  <!-- Grid lines -->
  ${gridEl.join("\n  ")}

  <!-- Drawdown zone (red fill between peak and current balance) -->
  <path d="${ddPath}" fill="url(#${ddGradId})" clip-path="url(#${clipId})"/>

  <!-- Gray-green area fill below balance line -->
  <path d="${areaPts.join(" ")}" fill="url(#${gradId})" clip-path="url(#${clipId})"/>

  <!-- Balance line (dark green, on top of fill) -->
  <path d="${linePts.join(" ")}" fill="none" stroke="#008000" stroke-width="1.5" stroke-linejoin="round" clip-path="url(#${clipId})"/>

  <!-- Axes -->
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${bottom}" stroke="#A0A0A0" stroke-width="1"/>
  <line x1="${PAD.left}" y1="${bottom}" x2="${PAD.left + cW}" y2="${bottom}" stroke="#A0A0A0" stroke-width="1"/>

  <!-- X-axis ticks and labels -->
  ${xEl.join("\n  ")}

  <!-- Chart footer label -->
  <text x="${SVG_W / 2}" y="${SVG_H - 5}" font-family="Tahoma,Arial" font-size="9" fill="#808080" text-anchor="middle">Balance</text>
</svg>`;
}
