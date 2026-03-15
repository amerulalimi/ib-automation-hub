/**
 * Generates MT5_Report_Template_Full.xlsx with sample data in Positions,
 * Deals_Auto, and Orders_Auto so the app can detect all three when uploading.
 * Run from project root: node frontend/scripts/generate-mt5-template.cjs
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const outPath = path.join(__dirname, "..", "..", "MT5_Report_Template_Full.xlsx");

function excelDate(y, m, d, h, min, s) {
  const dt = new Date(y, m - 1, d, h || 0, min || 0, s || 0);
  return dt;
}

const wb = XLSX.utils.book_new();

// ─── Positions ─────────────────────────────────────────────────────────────
const positionsHeader = [
  "Open Time",
  "Position",
  "Symbol",
  "Type",
  "Volume",
  "Open Price",
  "S/L",
  "T/P",
  "Close Time",
  "Close Price",
  "Commission",
  "Swap",
  "Profit",
];
const positionsData = [
  [
    excelDate(2026, 2, 2, 10, 15, 35),
    765479379,
    "XAUUSD.vx",
    "buy",
    0.01,
    4603.83,
    "",
    "",
    excelDate(2026, 2, 2, 10, 18, 2),
    4618.31,
    0,
    0,
    14.48,
  ],
  [
    excelDate(2026, 2, 2, 15, 56, 37),
    768732488,
    "XAUUSD.vx",
    "buy",
    0.01,
    4706.46,
    "",
    "",
    excelDate(2026, 2, 2, 15, 58, 52),
    4708.37,
    0,
    0,
    1.91,
  ],
  [
    excelDate(2026, 2, 2, 18, 15, 24),
    770503986,
    "XAUUSD.vx",
    "sell",
    0.01,
    4694.62,
    "",
    "",
    excelDate(2026, 2, 2, 18, 15, 57),
    4689.84,
    0,
    0,
    4.78,
  ],
  [
    excelDate(2026, 2, 3, 6, 25, 50),
    774201034,
    "XAUUSD.vx",
    "sell",
    0.01,
    4806.93,
    "",
    "",
    excelDate(2026, 2, 3, 6, 31, 13),
    4812.3,
    0,
    0,
    -5.37,
  ],
  [
    excelDate(2026, 2, 3, 6, 25, 53),
    774204559,
    "XAUUSD.vx",
    "sell",
    0.01,
    4810.56,
    "",
    "",
    excelDate(2026, 2, 3, 6, 31, 14),
    4812.66,
    0,
    0,
    -2.1,
  ],
];
const positionsSheet = XLSX.utils.aoa_to_sheet([positionsHeader, ...positionsData]);
XLSX.utils.book_append_sheet(wb, positionsSheet, "Positions");

// ─── Deals_Auto ───────────────────────────────────────────────────────────
const dealsHeader = [
  "Time",
  "Deal",
  "Symbol",
  "Type",
  "Direction",
  "Volume",
  "Price",
  "Order",
  "Cost",
  "Commission",
  "Fee",
  "Swap",
  "Profit",
  "Balance",
  "Comment",
];
const dealsData = [
  [excelDate(2026, 2, 2, 10, 0, 15), 784380249, "", "balance", "", "", "", "", "", 0, 0, 0, 88.15, 88.15, "TR #13341666|"],
  [excelDate(2026, 2, 2, 10, 16, 0), 784550662, "XAUUSD.vx", "buy", "in", 0.01, 4603.83, 765479379, 0, 0, 0, 0, "", 88.15, ""],
  [excelDate(2026, 2, 2, 10, 18, 27), 784571138, "XAUUSD.vx", "sell", "out", 0.01, 4618.31, 765499754, 0, 0, 0, 0, 14.48, 102.63, ""],
  [excelDate(2026, 2, 2, 15, 57, 3), 787806152, "XAUUSD.vx", "buy", "in", 0.01, 4706.46, 768732488, 0, 0, 0, 0, "", 102.63, ""],
  [excelDate(2026, 2, 2, 15, 59, 17), 787823039, "XAUUSD.vx", "sell", "out", 0.01, 4708.37, 768750116, 0, 0, 0, 0, 1.91, 104.54, ""],
  [excelDate(2026, 2, 2, 18, 15, 49), 789621273, "XAUUSD.vx", "sell", "in", 0.01, 4694.62, 770503986, 0, 0, 0, 0, "", 104.54, ""],
  [excelDate(2026, 2, 2, 18, 16, 22), 789628723, "XAUUSD.vx", "buy", "out", 0.01, 4689.84, 770511666, 0, 0, 0, 0, 4.78, 109.32, ""],
  [excelDate(2026, 2, 3, 6, 25, 50), 793300215, "XAUUSD.vx", "sell", "in", 0.01, 4806.93, 774201034, 0, 0, 0, 0, "", 109.32, ""],
  [excelDate(2026, 2, 3, 6, 31, 13), 793329073, "XAUUSD.vx", "buy", "out", 0.01, 4812.3, 774231256, 0, 0, 0, 0, -5.37, 103.95, ""],
  [excelDate(2026, 2, 3, 6, 26, 19), 793303619, "XAUUSD.vx", "sell", "in", 0.01, 4810.56, 774204559, 0, 0, 0, 0, "", 103.95, ""],
  [excelDate(2026, 2, 3, 6, 31, 14), 793329104, "XAUUSD.vx", "buy", "out", 0.01, 4812.66, 774231284, 0, 0, 0, 0, -2.1, 101.85, ""],
];
const dealsSheet = XLSX.utils.aoa_to_sheet([["Deals (auto from Positions)"], [], dealsHeader, ...dealsData]);
XLSX.utils.book_append_sheet(wb, dealsSheet, "Deals_Auto");

// ─── Orders_Auto ───────────────────────────────────────────────────────────
const ordersHeader = [
  "Open Time",
  "Order",
  "Symbol",
  "Type",
  "Volume",
  "Price",
  "S / L",
  "T / P",
  "Time",
  "State",
  "Comment",
];
const ordersData = [
  [excelDate(2026, 2, 2, 10, 16, 0), 765479379, "XAUUSD.vx", "buy", "0.01", "market", "", "", excelDate(2026, 2, 2, 10, 16, 0), "filled", ""],
  [excelDate(2026, 2, 2, 10, 18, 27), 765499754, "XAUUSD.vx", "sell", "0.01", "market", "", "", excelDate(2026, 2, 2, 10, 18, 27), "filled", ""],
  [excelDate(2026, 2, 2, 15, 57, 3), 768732488, "XAUUSD.vx", "buy", "0.01", "market", "", "", excelDate(2026, 2, 2, 15, 57, 3), "filled", ""],
  [excelDate(2026, 2, 2, 15, 59, 17), 768750116, "XAUUSD.vx", "sell", "0.01", "market", "", "", excelDate(2026, 2, 2, 15, 59, 17), "filled", ""],
  [excelDate(2026, 2, 2, 18, 15, 49), 770503986, "XAUUSD.vx", "sell", "0.01", "market", "", "", excelDate(2026, 2, 2, 18, 15, 49), "filled", ""],
  [excelDate(2026, 2, 2, 18, 16, 22), 770511666, "XAUUSD.vx", "buy", "0.01", "market", "", "", excelDate(2026, 2, 2, 18, 16, 22), "filled", ""],
  [excelDate(2026, 2, 3, 6, 25, 50), 774201034, "XAUUSD.vx", "sell", "0.01", "market", "", "", excelDate(2026, 2, 3, 6, 25, 50), "filled", ""],
  [excelDate(2026, 2, 3, 6, 31, 13), 774231256, "XAUUSD.vx", "buy", "0.01", "market", "", "", excelDate(2026, 2, 3, 6, 31, 13), "filled", ""],
  [excelDate(2026, 2, 3, 6, 26, 19), 774204559, "XAUUSD.vx", "sell", "0.01", "market", "", "", excelDate(2026, 2, 3, 6, 26, 19), "filled", ""],
  [excelDate(2026, 2, 3, 6, 31, 14), 774231284, "XAUUSD.vx", "buy", "0.01", "market", "", "", excelDate(2026, 2, 3, 6, 31, 14), "filled", ""],
];
const ordersSheet = XLSX.utils.aoa_to_sheet([["Orders (auto from Positions)"], [], ordersHeader, ...ordersData]);
XLSX.utils.book_append_sheet(wb, ordersSheet, "Orders_Auto");

// ─── Inputs (optional) ──────────────────────────────────────────────────────
const inputsData = [
  ["MT5 Template Controls", ""],
  ["", ""],
  ["Start Balance", 88.15],
  ["Deposits", 0],
  ["Withdrawals", 0],
  ["Credit Facility", 0],
  ["Floating P/L", 0],
  ["Margin", 0],
];
const inputsSheet = XLSX.utils.aoa_to_sheet(inputsData);
XLSX.utils.book_append_sheet(wb, inputsSheet, "Inputs");

XLSX.writeFile(wb, outPath);
console.log("Written:", outPath);
