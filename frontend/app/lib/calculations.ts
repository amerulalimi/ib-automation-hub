import type { DealRow, PositionRow, SummaryStats, ResultStats } from "./types";

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function safeNum(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[, ]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function calculateStats(
  deals: DealRow[],
  positions: PositionRow[]
): { summary: SummaryStats; results: ResultStats } {
  // Collect per-trade profits (only "out" deals or all positions)
  const outDeals: Array<{ profit: string; type?: string }> =
    deals.length > 0
      ? deals.filter((d) => d.direction?.toLowerCase() === "out" || !d.direction)
      : positions;

  const profits = outDeals.map((d) => safeNum(d.profit));
  const totalTrades = profits.length;

  const grossProfit = profits.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = profits.filter((p) => p < 0).reduce((a, b) => a + b, 0);
  const totalNetProfit = grossProfit + grossLoss;
  const profitFactor = grossLoss !== 0 ? Math.abs(grossProfit / grossLoss) : 0;
  const expectedPayoff = totalTrades > 0 ? totalNetProfit / totalTrades : 0;

  // Balance - take from last deal row
  const lastBalance =
    deals.length > 0
      ? safeNum(deals[deals.length - 1].balance)
      : 0;
  const balance = lastBalance || 0;

  // Drawdown calculations
  let peakBalance = 0;
  let maxDrawdown = 0;
  let initialBalance = 0;
  let maxDrawdownPct = 0;
  let absoluteDrawdown = 0;

  if (deals.length > 0) {
    const balances = deals
      .map((d) => safeNum(d.balance))
      .filter((b) => b > 0);

    if (balances.length > 0) {
      initialBalance = balances[0];
      peakBalance = balances[0];

      for (const b of balances) {
        if (b > peakBalance) peakBalance = b;
        const dd = peakBalance - b;
        if (dd > maxDrawdown) {
          maxDrawdown = dd;
          maxDrawdownPct = peakBalance > 0 ? (dd / peakBalance) * 100 : 0;
        }
      }

      absoluteDrawdown = Math.max(0, initialBalance - Math.min(...balances));
    }
  }

  // Short vs Long trades
  const shortTrades = outDeals.filter((d) => d.type?.toLowerCase() === "sell");
  const longTrades = outDeals.filter((d) => d.type?.toLowerCase() === "buy");

  const shortWon = shortTrades.filter((d) => safeNum(d.profit) > 0).length;
  const longWon  = longTrades.filter((d) => safeNum(d.profit) > 0).length;

  const profitTradesArr = profits.filter((p) => p > 0);
  const lossTradesArr = profits.filter((p) => p < 0);

  const largestProfit = profitTradesArr.length > 0 ? Math.max(...profitTradesArr) : 0;
  const largestLoss = lossTradesArr.length > 0 ? Math.min(...lossTradesArr) : 0;
  const avgProfit =
    profitTradesArr.length > 0
      ? profitTradesArr.reduce((a, b) => a + b, 0) / profitTradesArr.length
      : 0;
  const avgLoss =
    lossTradesArr.length > 0
      ? lossTradesArr.reduce((a, b) => a + b, 0) / lossTradesArr.length
      : 0;

  // Consecutive wins/losses
  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let maxConsecProfitAmount = 0;
  let maxConsecProfitCount = 0;
  let maxConsecLossAmount = 0;
  let maxConsecLossCount = 0;
  let avgConsecWins = 0;
  let avgConsecLosses = 0;

  let curWins = 0;
  let curLosses = 0;
  let curWinAmt = 0;
  let curLossAmt = 0;
  let winStreaks: number[] = [];
  let lossStreaks: number[] = [];

  for (const p of profits) {
    if (p > 0) {
      curWins++;
      curWinAmt += p;
      if (curLosses > 0) {
        lossStreaks.push(curLosses);
        if (curLossAmt < maxConsecLossAmount) {
          maxConsecLossAmount = curLossAmt;
          maxConsecLossCount = curLosses;
        }
        curLosses = 0;
        curLossAmt = 0;
      }
    } else if (p < 0) {
      curLosses++;
      curLossAmt += p;
      if (curWins > 0) {
        winStreaks.push(curWins);
        if (curWinAmt > maxConsecProfitAmount) {
          maxConsecProfitAmount = curWinAmt;
          maxConsecProfitCount = curWins;
        }
        curWins = 0;
        curWinAmt = 0;
      }
    }
    maxConsecWins = Math.max(maxConsecWins, curWins);
    maxConsecLosses = Math.max(maxConsecLosses, curLosses);
  }
  if (curWins > 0) {
    winStreaks.push(curWins);
    if (curWinAmt > maxConsecProfitAmount) {
      maxConsecProfitAmount = curWinAmt;
      maxConsecProfitCount = curWins;
    }
  }
  if (curLosses > 0) {
    lossStreaks.push(curLosses);
    if (curLossAmt < maxConsecLossAmount) {
      maxConsecLossAmount = curLossAmt;
      maxConsecLossCount = curLosses;
    }
  }

  avgConsecWins =
    winStreaks.length > 0
      ? Math.round(winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length)
      : 0;
  avgConsecLosses =
    lossStreaks.length > 0
      ? Math.round(lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length)
      : 0;

  // Recovery factor
  const recoveryFactor = maxDrawdown > 0 ? totalNetProfit / maxDrawdown : 0;

  const summary: SummaryStats = {
    balance: fmt(balance),
    creditFacility: "0.00",
    floatingPL: "0.00",
    equity: fmt(balance),
    freeMargin: fmt(balance),
    margin: "0.00",
    marginLevel: "0.00%",
  };

  const results: ResultStats = {
    totalNetProfit: fmt(totalNetProfit),
    grossProfit: fmt(grossProfit),
    grossLoss: fmt(grossLoss),
    profitFactor: fmt(profitFactor),
    expectedPayoff: fmt(expectedPayoff),
    recoveryFactor: fmt(recoveryFactor),
    sharpeRatio: "0.00",
    balanceDrawdownAbsolute: fmt(absoluteDrawdown),
    balanceDrawdownMaximal: `${fmt(maxDrawdown)} (${fmt(maxDrawdownPct)}%)`,
    balanceDrawdownRelative: `${fmt(maxDrawdownPct)}% (${fmt(maxDrawdown)})`,
    totalTrades: String(totalTrades),
    shortTradesWon: `${shortTrades.length} (${shortTrades.length > 0 ? fmt((shortWon / shortTrades.length) * 100) : "0.00"}%)`,
    longTradesWon: `${longTrades.length} (${longTrades.length > 0 ? fmt((longWon / longTrades.length) * 100) : "0.00"}%)`,
    profitTrades: `${profitTradesArr.length} (${totalTrades > 0 ? fmt((profitTradesArr.length / totalTrades) * 100) : "0.00"}%)`,
    lossTrades: `${lossTradesArr.length} (${totalTrades > 0 ? fmt((lossTradesArr.length / totalTrades) * 100) : "0.00"}%)`,
    largestProfitTrade: fmt(largestProfit),
    largestLossTrade: fmt(largestLoss),
    averageProfitTrade: fmt(avgProfit),
    averageLossTrade: fmt(avgLoss),
    maxConsecutiveWins: `${maxConsecWins} (${fmt(maxConsecProfitAmount)})`,
    maxConsecutiveLosses: `${maxConsecLosses} (${fmt(maxConsecLossAmount)})`,
    maximalConsecutiveProfit: `${fmt(maxConsecProfitAmount)} (${maxConsecProfitCount})`,
    maximalConsecutiveLoss: `${fmt(maxConsecLossAmount)} (${maxConsecLossCount})`,
    averageConsecutiveWins: String(avgConsecWins),
    averageConsecutiveLosses: String(avgConsecLosses),
  };

  return { summary, results };
}
