import type {
  AccountInfo,
  PositionRow,
  DealRow,
  OrderRow,
  SummaryStats,
  ResultStats,
} from "./types";
import { prepareChartData, calcDrawdownStats, generateBalanceChartSVG } from "./chartData";

function escapeHtml(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPositionRows(positions: PositionRow[]): string {
  if (positions.length === 0) return "";
  return positions
    .map((p, idx) => {
      const bg = idx % 2 === 0 ? "#FFFFFF" : "#F7F7F7";
      return `        <tr bgcolor="${bg}" align="right">
            <td>${escapeHtml(p.openTime)}</td>
            <td>${escapeHtml(p.position)}</td>
            <td>${escapeHtml(p.symbol)}</td>
            <td>${escapeHtml(p.type)}</td>
            <td class="hidden" colspan="8"></td>
            <td class="">${escapeHtml(p.volume)}</td>
            <td class="">${escapeHtml(p.openPrice)}</td>
            <td class="">${escapeHtml(p.sl)}</td>
            <td class="">${escapeHtml(p.tp)}</td>
            <td class="">${escapeHtml(p.closeTime)}</td>
            <td class="">${escapeHtml(p.closePrice)}</td>
            <td class="">${escapeHtml(p.commission)}</td>
            <td class="">${escapeHtml(p.swap)}</td>
            <td colspan="2">${escapeHtml(p.profit)}</td>
        </tr>`;
    })
    .join("\n");
}

function buildDealRows(deals: DealRow[]): string {
  if (deals.length === 0) return "";
  return deals
    .map((d, idx) => {
      const bg = idx % 2 === 0 ? "#FFFFFF" : "#F7F7F7";
      return `        <tr bgcolor="${bg}" align="right"><td nowrap>${escapeHtml(d.time)}</td><td nowrap>${escapeHtml(d.deal)}</td><td nowrap>${escapeHtml(d.symbol)}</td><td nowrap>${escapeHtml(d.type)}</td><td nowrap>${escapeHtml(d.direction)}</td><td nowrap>${escapeHtml(d.volume)}</td><td nowrap>${escapeHtml(d.price)}</td><td nowrap>${escapeHtml(d.order)}</td><td nowrap class="hidden"></td><td nowrap>${escapeHtml(d.commission)}</td><td nowrap>${escapeHtml(d.fee)}</td><td nowrap>${escapeHtml(d.swap)}</td><td nowrap>${escapeHtml(d.profit)}</td><td nowrap>${escapeHtml(d.balance)}</td><td nowrap>${escapeHtml(d.comment)}</td></tr>`;
    })
    .join("\n");
}

function buildDealsTotals(deals: DealRow[], summary: SummaryStats): string {
  if (deals.length === 0) return "";

  let totalCommission = 0;
  let totalFee = 0;
  let totalSwap = 0;
  let totalProfit = 0;

  for (const d of deals) {
    totalCommission += parseFloat(d.commission || "0") || 0;
    totalFee += parseFloat(d.fee || "0") || 0;
    totalSwap += parseFloat(d.swap || "0") || 0;
    totalProfit += parseFloat(d.profit || "0") || 0;
  }

  const lastBalance = summary.balance;

  return `        <tr align="right">
            <td nowrap colspan="8" style="height: 30px"></td>
            <td nowrap><b>${totalCommission.toFixed(2)}</b></td>
            <td nowrap><b>${totalFee.toFixed(2)}</b></td>
            <td nowrap><b>${totalSwap.toFixed(2)}</b></td>
            <td nowrap><b>${totalProfit.toFixed(2)}</b></td>
            <td nowrap><b>${lastBalance}</b></td>
            <td nowrap></td>
        </tr>`;
}

function buildChartSection(
  deals: DealRow[],
  positions: PositionRow[],
  summary: SummaryStats,
  chartBase64: string | null
): string {
  // ── Strategy ────────────────────────────────────────────────────────────────
  // Primary  : Use the captured Base64 PNG from the live Recharts component.
  //            → Pixel-perfect match with what the user sees in the preview.
  //            → Embedded as data:image/png;base64,... — works 100% offline.
  // Fallback : If capture failed/unavailable, generate a pure inline SVG.
  //            → Also fully offline, no external dependencies.
  // ─────────────────────────────────────────────────────────────────────────────

  const chartData = prepareChartData(deals, positions);
  const hasData   = chartData.length >= 2;
  if (!hasData && !chartBase64) return "";

  // Build the chart image element
  let chartImgEl: string;
  if (chartBase64) {
    // Base64 PNG — captured from the live Recharts render
    chartImgEl = `<img src="${chartBase64}" width="820" height="220" alt="Balance Graph" style="display:block;border:1px solid #CCCCCC;" />`;
  } else {
    // Inline SVG fallback
    const svg = generateBalanceChartSVG(chartData);
    if (!svg) return "";
    chartImgEl = svg;
  }

  const noop = !chartBase64 && !hasData;
  if (noop) {
    return `        <tr align="right">
            <td colspan="13" style="height: 10px"></td>
        </tr>
        <tr align="center">
            <th colspan="13"><img src="ReportHistory-191241505.png" title="Balance graph" width=820 height=200 border=0 alt="Graph"></th>
        </tr>`;
  }

  const dd = calcDrawdownStats(chartData);

  return `        <tr align="right">
            <td colspan="13" style="height: 10px"></td>
        </tr>
        <tr align="center">
            <th colspan="13"><div style="font: 10pt Tahoma"><b>Balance Graph</b></div></th>
        </tr>
        <tr align="center">
            <td colspan="13" style="padding: 4px 0;">
                ${chartImgEl}
            </td>
        </tr>
        <tr align="center">
            <td colspan="13" style="padding: 4px 0;">
                <table cellspacing="0" cellpadding="3" border="0" style="margin:auto; font: 8pt Tahoma,Arial;">
                    <tr bgcolor="#E5F0FC" align="center">
                        <td nowrap><b>Max Drawdown</b></td>
                        <td nowrap><b>Max Drawdown %</b></td>
                        <td nowrap><b>Peak Balance</b></td>
                        <td nowrap><b>Trough Balance</b></td>
                        <td nowrap><b>Current Drawdown</b></td>
                        <td nowrap><b>Current DD %</b></td>
                    </tr>
                    <tr align="right">
                        <td style="color:#CC0000"><b>-${dd.maxDrawdown.toFixed(2)}</b></td>
                        <td style="color:#CC0000"><b>-${dd.maxDrawdownPct.toFixed(2)}%</b></td>
                        <td>${dd.maxDrawdownFrom.toFixed(2)}</td>
                        <td>${dd.maxDrawdownTo.toFixed(2)}</td>
                        <td style="color:${dd.currentDrawdown > 0 ? "#CC0000" : "inherit"}"><b>-${dd.currentDrawdown.toFixed(2)}</b></td>
                        <td style="color:${dd.currentDrawdown > 0 ? "#CC0000" : "inherit"}"><b>-${dd.currentDrawdownPct.toFixed(2)}%</b></td>
                    </tr>
                </table>
            </td>
        </tr>`;
}

function buildOrderRows(orders: OrderRow[]): string {
  if (orders.length === 0) return "";
  return orders
    .map((o, idx) => {
      const bg = idx % 2 === 0 ? "#FFFFFF" : "#F7F7F7";
      const vol = o.volume ? `${o.volume} / ${o.volume}` : " / ";
      return `        <tr bgcolor="${bg}" align="right"><td>${escapeHtml(o.openTime)}</td><td>${escapeHtml(o.order)}</td><td>${escapeHtml(o.symbol)}</td><td>${escapeHtml(o.type)}</td><td>${escapeHtml(vol)}</td><td>${escapeHtml(o.price)}</td><td>${escapeHtml(o.sl)}</td><td>${escapeHtml(o.tp)}</td><td>${escapeHtml(o.time)}</td><td colspan="2">${escapeHtml(o.state)}</td><td colspan="3">${escapeHtml(o.comment)}</td></tr>`;
    })
    .join("\n");
}

export function generateMT5HTML(
  accountInfo: AccountInfo,
  positions: PositionRow[],
  deals: DealRow[],
  orders: OrderRow[],
  summary: SummaryStats,
  results: ResultStats,
  chartBase64: string | null = null,  // Base64 PNG from Recharts capture (preferred)
  includeChart: boolean = true        // when false, omit Balance Graph section (MT5 report without chart)
): string {
  const positionRows = buildPositionRows(positions);
  const dealRows = buildDealRows(deals);
  const dealTotals = buildDealsTotals(deals, summary);
  const orderRows = buildOrderRows(orders);
  const chartPlaceholderRow = `        <tr align="right">
            <td colspan="13" style="height: 10px"></td>
        </tr>
        <tr align="center">
            <th colspan="13"><img src="ReportHistory-191241505.png" title="Balance graph" width=820 height=200 border=0 alt="Graph"></th>
        </tr>`;
  const chartSection =
    includeChart !== false ? buildChartSection(deals, positions, summary, chartBase64) : "";
  const chartBlock = chartSection || chartPlaceholderRow;

  const positionsSection =
    positions.length > 0
      ? `        <tr align="center">
            <th colspan="14" style="height: 25px"><div style="font: 10pt Tahoma"><b>Positions</b></div></th>
        </tr>
        <tr align="center" bgcolor="#E5F0FC">
            <td nowrap style="height: 30px"><b>Time</b></td>
            <td nowrap><b>Position</b></td>
            <td nowrap><b>Symbol</b></td>
            <td nowrap><b>Type</b></td>
            <td nowrap><b>Volume</b></td>
            <td nowrap><b>Price</b></td>
            <td nowrap><b>S / L</b></td>
            <td nowrap><b>T / P</b></td>
            <td nowrap><b>Time</b></td>
            <td nowrap><b>Price</b></td>
            <td nowrap><b>Commission</b></td>
            <td nowrap><b>Swap</b></td>
            <td nowrap colspan="2"><b>Profit</b></td>
        </tr>
${positionRows}`
      : "";

  const dealsSection =
    deals.length > 0
      ? `        <tr>
            <td nowrap style="height: 10px"></td>
        </tr>
        <tr align="center">
            <th colspan="14" style="height: 25px"><div style="font: 10pt Tahoma"><b>Deals</b></div></th>
        </tr>
        <tr align="center" bgcolor="#E5F0FC">
            <td nowrap style="height: 30px"><b>Time</b></td>
            <td nowrap><b>Deal</b></td>
            <td nowrap><b>Symbol</b></td>
            <td nowrap><b>Type</b></td>
            <td nowrap><b>Direction</b></td>
            <td nowrap><b>Volume</b></td>
            <td nowrap><b>Price</b></td>
            <td nowrap><b>Order</b></td>
            <td nowrap class="hidden"><b>Cost</b></td>
            <td nowrap><b>Commission</b></td>
            <td nowrap><b>Fee</b></td>
            <td nowrap><b>Swap</b></td>
            <td nowrap><b>Profit</b></td>
            <td nowrap><b>Balance</b></td>
            <td nowrap><b>Comment</b></td>
        </tr>
${dealRows}
${dealTotals}`
      : "";

  const ordersSection =
    orders.length > 0
      ? `        <tr>
            <td nowrap style="height: 10px"></td>
        </tr>
        <tr align="center">
            <th colspan="14" style="height: 25px"><div style="font: 10pt Tahoma"><b>Orders</b></div></th>
        </tr>
        <tr align="center" bgcolor="#E5F0FC">
            <td nowrap style="height: 30px"><b>Open Time</b></td>
            <td nowrap><b>Order</b></td>
            <td nowrap><b>Symbol</b></td>
            <td nowrap><b>Type</b></td>
            <td nowrap><b>Volume</b></td>
            <td nowrap><b>Price</b></td>
            <td nowrap><b>S / L</b></td>
            <td nowrap><b>T / P</b></td>
            <td nowrap><b>Time</b></td>
            <td nowrap colspan="2"><b>State</b></td>
            <td nowrap colspan="3"><b>Comment</b></td>
        </tr>
${orderRows}`
      : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
  <head>
    <title>${escapeHtml(accountInfo.account)}: ${escapeHtml(accountInfo.name)} - Trade History Report</title>
    <meta name="generator" content="MT5 Report Generator">
    <style type="text/css">
    <!--
    @media screen {
      td { font: 8pt  Tahoma,Arial; }
      th { font: 10pt Tahoma,Arial; }
    }
    @media print {
      td { font: 7pt Tahoma,Arial; }
      th { font: 9pt Tahoma,Arial; }
    }
    .msdate { mso-number-format:"General Date"; }
    .mspt   { mso-number-format:\\#\\,\\#\\#0\\.00;  }
    .hidden { display: none; }
    body {margin:1px;}
    //-->
    </style>
  </head>
<body>
<div align="center">
    <table cellspacing="1" cellpadding="3" border="0">
        <tr align="center">
            <td colspan="14"><div style="font: 14pt Tahoma"><b>Trade History Report</b><br></div></td>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Name:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>${escapeHtml(accountInfo.name)}</b></th>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Account:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>${escapeHtml(accountInfo.account)}</b></th>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Company:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>${escapeHtml(accountInfo.company)}</b></th>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Date:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>${escapeHtml(accountInfo.date)}</b></th>
        </tr>
        <tr>
            <td nowrap style="width: 140px;height: 10px"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 70px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 140px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 60px;"></td>
            <td nowrap style="width: 100px;"></td>
        </tr>
${positionsSection}
${ordersSection}
${dealsSection}
        <tr align="right">
            <td colspan="13" style="height: 10px"></td>
        </tr>
        <tr align="right">
            <td colspan="3" style="height: 20px">Balance:</td>
            <td colspan="2"><b>${summary.balance}</b></td>
            <td></td>
            <td colspan="3">Free Margin:</td>
            <td colspan="2"><b>${summary.freeMargin}</b></td>
        </tr>
        <tr align="right">
            <td colspan="3" style="height: 20px">Credit Facility:</td>
            <td colspan="2"><b>${summary.creditFacility}</b></td>
            <td></td>
            <td colspan="3">Margin:</td>
            <td colspan="2"><b>${summary.margin}</b></td>
        </tr>
        <tr align="right">
            <td colspan="3" style="height: 20px">Floating P/L:</td>
            <td colspan="2"><b>${summary.floatingPL}</b></td>
            <td></td>
            <td colspan="3">Margin Level:</td>
            <td colspan="2"><b>${summary.marginLevel}</b></td>
        </tr>
        <tr align="right">
            <td colspan="3" style="height: 20px">Equity:</td>
            <td colspan="2"><b>${summary.equity}</b></td>
        </tr>
${chartBlock}
        <tr align="right">
            <td colspan="13" style="height: 10px"></td>
        </tr>
        <tr>
            <td colspan="13" align="center"><div style="font: 10pt Tahoma"><b>Results</b></div></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="3">Total Net Profit:</td>
            <td nowrap><b>${results.totalNetProfit}</b></td>
            <td nowrap colspan="3">Gross Profit:</td>
            <td nowrap><b>${results.grossProfit}</b></td>
            <td nowrap colspan="3">Gross Loss:</td>
            <td nowrap colspan="2"><b>${results.grossLoss}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="3">Profit Factor:</td>
            <td nowrap><b>${results.profitFactor}</b></td>
            <td nowrap colspan="3">Expected Payoff:</td>
            <td nowrap><b>${results.expectedPayoff}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="3">Recovery Factor:</td>
            <td nowrap><b>${results.recoveryFactor}</b></td>
            <td nowrap colspan="3">Sharpe Ratio:</td>
            <td nowrap><b>${results.sharpeRatio}</b></td>
        </tr>
        <tr>
            <td nowrap style="height: 10px"></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="3">Balance Drawdown:</td>
        </tr>
        <tr align="right">
            <td nowrap colspan="3">Balance Drawdown Absolute:</td>
            <td nowrap><b>${results.balanceDrawdownAbsolute}</b></td>
            <td nowrap colspan="3">Balance Drawdown Maximal:</td>
            <td nowrap><b>${results.balanceDrawdownMaximal}</b></td>
            <td nowrap colspan="3">Balance Drawdown Relative:</td>
            <td nowrap colspan="2"><b>${results.balanceDrawdownRelative}</b></td>
        </tr>
        <tr>
            <td nowrap style="height: 10px"></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="3">Total Trades:</td>
            <td nowrap><b>${results.totalTrades}</b></td>
            <td nowrap colspan="3">Short Trades (won %):</td>
            <td nowrap><b>${results.shortTradesWon}</b></td>
            <td nowrap colspan="3">Long Trades (won %):</td>
            <td nowrap colspan="2"><b>${results.longTradesWon}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Profit Trades (% of total):</td>
            <td nowrap><b>${results.profitTrades}</b></td>
            <td nowrap colspan="3">Loss Trades (% of total):</td>
            <td nowrap colspan="2"><b>${results.lossTrades}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Largest profit trade:</td>
            <td nowrap><b>${results.largestProfitTrade}</b></td>
            <td nowrap colspan="3">Largest loss trade:</td>
            <td nowrap colspan="2"><b>${results.largestLossTrade}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Average profit trade:</td>
            <td nowrap><b>${results.averageProfitTrade}</b></td>
            <td nowrap colspan="3">Average loss trade:</td>
            <td nowrap colspan="2"><b>${results.averageLossTrade}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Maximum consecutive wins ($):</td>
            <td nowrap><b>${results.maxConsecutiveWins}</b></td>
            <td nowrap colspan="3">Maximum consecutive losses ($):</td>
            <td nowrap colspan="2"><b>${results.maxConsecutiveLosses}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Maximal consecutive profit (count):</td>
            <td nowrap><b>${results.maximalConsecutiveProfit}</b></td>
            <td nowrap colspan="3">Maximal consecutive loss (count):</td>
            <td nowrap colspan="2"><b>${results.maximalConsecutiveLoss}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Average consecutive wins:</td>
            <td nowrap><b>${results.averageConsecutiveWins}</b></td>
            <td nowrap colspan="3">Average consecutive losses:</td>
            <td nowrap colspan="2"><b>${results.averageConsecutiveLosses}</b></td>
        </tr>
        <tr>
            <td nowrap style="height: 10px"></td>
        </tr>
    </table>
</div>
</body>
</html>`;
}
