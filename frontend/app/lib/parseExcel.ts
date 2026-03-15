import * as XLSX from "xlsx";
import type {
  PositionRow,
  DealRow,
  OrderRow,
  ParsedReport,
  SummaryStats,
  ResultStats,
} from "./types";
import { calculateStats } from "./calculations";

// Format any date-like value to MT5 format YYYY.MM.DD HH:mm:ss
export function toMT5DateTime(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (!s) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    const h = String(value.getHours()).padStart(2, "0");
    const min = String(value.getMinutes()).padStart(2, "0");
    const sec = String(value.getSeconds()).padStart(2, "0");
    return `${y}.${m}.${d} ${h}:${min}:${sec}`;
  }
  // Already MT5-like YYYY.MM.DD or YYYY.MM.DD HH:mm:ss
  if (/^\d{4}\.\d{2}\.\d{2}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(s)) return s;
  // Try parse as date string (e.g. "Mon Feb 02 2026...")
  const parsed = new Date(value as string | number);
  if (!isNaN(parsed.getTime())) {
    return toMT5DateTime(parsed);
  }
  return s;
}

// Normalize header string for matching
function normalizeHeader(h: string): string {
  return h.toString().toLowerCase().trim().replace(/\s+/g, " ");
}

// Map normalized header → PositionRow field
const POSITION_HEADER_MAP: Record<string, keyof PositionRow> = {
  time: "openTime",
  "open time": "openTime",
  "open_time": "openTime",
  position: "position",
  symbol: "symbol",
  type: "type",
  volume: "volume",
  price: "openPrice",
  "open price": "openPrice",
  "open_price": "openPrice",
  "s / l": "sl",
  "s/l": "sl",
  sl: "sl",
  "stop loss": "sl",
  stoploss: "sl",
  "t / p": "tp",
  "t/p": "tp",
  tp: "tp",
  "take profit": "tp",
  takeprofit: "tp",
  "close time": "closeTime",
  "close_time": "closeTime",
  closetime: "closeTime",
  "close price": "closePrice",
  "close_price": "closePrice",
  closeprice: "closePrice",
  commission: "commission",
  swap: "swap",
  profit: "profit",
};

// Map normalized header → DealRow field
const DEAL_HEADER_MAP: Record<string, keyof DealRow> = {
  time: "time",
  deal: "deal",
  symbol: "symbol",
  type: "type",
  direction: "direction",
  volume: "volume",
  price: "price",
  order: "order",
  commission: "commission",
  fee: "fee",
  swap: "swap",
  profit: "profit",
  balance: "balance",
  comment: "comment",
};

// Map normalized header → OrderRow field
const ORDER_HEADER_MAP: Record<string, keyof OrderRow> = {
  "open time": "openTime",
  opentime: "openTime",
  open_time: "openTime",
  order: "order",
  symbol: "symbol",
  type: "type",
  volume: "volume",
  price: "price",
  "s / l": "sl",
  "s/l": "sl",
  sl: "sl",
  "t / p": "tp",
  "t/p": "tp",
  tp: "tp",
  time: "time",
  state: "state",
  comment: "comment",
};

function parseRows<T extends object>(
  data: unknown[][],
  headerRow: unknown[],
  headerMap: Record<string, keyof T>,
  dateFields?: (keyof T)[]
): T[] {
  const colIndex: Partial<Record<keyof T, number>> = {};
  const dateFieldSet = dateFields ? new Set(dateFields) : null;

  headerRow.forEach((cell, idx) => {
    if (!cell) return;
    const normalized = normalizeHeader(String(cell));
    const field = headerMap[normalized];
    if (field !== undefined && colIndex[field] === undefined) {
      colIndex[field] = idx;
    }
  });

  return data
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""))
    .map((row) => {
      const obj: Partial<T> = {};
      for (const [field, idx] of Object.entries(colIndex) as [keyof T, number][]) {
        const val = row[idx];
        const str =
          val !== null && val !== undefined
            ? dateFieldSet?.has(field)
              ? toMT5DateTime(val)
              : String(val).trim()
            : "";
        (obj as Record<keyof T, string>)[field] = str;
      }
      return obj as T;
    });
}

function detectSheetType(
  headers: string[]
): "positions" | "deals" | "orders" | "unknown" {
  const normalized = headers.map(normalizeHeader);
  const hasPosition = normalized.includes("position");
  const hasDeal = normalized.includes("deal");
  const hasDirection = normalized.includes("direction");
  const hasOrder = normalized.includes("order");
  const hasOpenTime =
    normalized.includes("open time") || normalized.includes("opentime");

  if (hasDeal || hasDirection) return "deals";
  if (hasPosition) return "positions";
  if (hasOrder && hasOpenTime) return "orders";
  return "unknown";
}

function findHeaderRow(sheet: XLSX.WorkSheet): { rowIndex: number; headers: string[] } | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
    const rowCells: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      rowCells.push(cell ? String(cell.v).trim() : "");
    }
    const filled = rowCells.filter(Boolean);
    if (filled.length >= 3) {
      const norms = filled.map(normalizeHeader);
      if (
        norms.some((h) =>
          ["time", "open time", "profit", "symbol", "deal", "position", "order"].includes(h)
        )
      ) {
        return { rowIndex: r, headers: rowCells };
      }
    }
  }
  return null;
}

function sheetToData(sheet: XLSX.WorkSheet, startRow: number): unknown[][] {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const result: unknown[][] = [];
  for (let r = startRow + 1; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      row.push(cell ? cell.v : "");
    }
    result.push(row);
  }
  return result;
}

// ─── Inputs sheet (A2:B8): Start Balance, Deposits, Withdrawals, Credit Facility, Floating P/L, Margin ───
function parseInputsSheet(sheet: XLSX.WorkSheet): Partial<SummaryStats> | null {
  const out: Partial<SummaryStats> = {};
  let hasAny = false;
  let startBalance = 0;
  let deposits = 0;
  let withdrawals = 0;
  for (let r = 2; r <= 10; r++) {
    const a = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    const b = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const label = a ? normalizeHeader(String(a.v)) : "";
    const rawVal = b != null && b !== undefined ? String((b as { v?: unknown }).v ?? "").trim() : "";
    const numVal = rawVal === "" ? NaN : parseFloat(rawVal.replace(/[, ]/g, ""));
    if (!label) continue;
    if (label === "start balance") {
      startBalance = !isNaN(numVal) ? numVal : 0;
      hasAny = true;
    } else if (label === "deposits") {
      deposits = !isNaN(numVal) ? numVal : 0;
      hasAny = true;
    } else if (label === "withdrawals") {
      withdrawals = !isNaN(numVal) ? numVal : 0;
      hasAny = true;
    } else if (label === "credit facility") {
      out.creditFacility = rawVal || "0.00";
      hasAny = true;
    } else if (label === "floating p/l" || label === "floating p / l") {
      out.floatingPL = rawVal || "0.00";
      hasAny = true;
    } else if (label === "margin") {
      out.margin = rawVal || "0.00";
      hasAny = true;
    }
  }
  if (hasAny) {
    const balance = startBalance + deposits - withdrawals;
    if (out.balance === undefined) out.balance = balance.toFixed(2);
  }
  return hasAny ? out : null;
}

// Summary sheet: row 3 = header "Metric" / "Value", then rows 4+ with A=metric name, B=value
const SUMMARY_METRIC_TO_FIELD: Record<string, keyof SummaryStats> = {
  balance: "balance",
  "credit facility": "creditFacility",
  "floating p/l": "floatingPL",
  "floating p / l": "floatingPL",
  equity: "equity",
  "free margin": "freeMargin",
  margin: "margin",
  "margin level": "marginLevel",
};

const SUMMARY_METRIC_TO_RESULT_FIELD: Record<string, keyof ResultStats> = {
  "total net profit": "totalNetProfit",
  "gross profit": "grossProfit",
  "gross loss": "grossLoss",
  "profit factor": "profitFactor",
  "expected payoff": "expectedPayoff",
  "recovery factor": "recoveryFactor",
  "sharpe ratio": "sharpeRatio",
  "balance drawdown absolute": "balanceDrawdownAbsolute",
  "balance drawdown maximal": "balanceDrawdownMaximal",
  "balance drawdown relative": "balanceDrawdownRelative",
  "total trades": "totalTrades",
  "short trades (won %)": "shortTradesWon",
  "long trades (won %)": "longTradesWon",
  "profit trades (% of total)": "profitTrades",
  "loss trades (% of total)": "lossTrades",
  "largest profit trade": "largestProfitTrade",
  "largest loss trade": "largestLossTrade",
  "average profit trade": "averageProfitTrade",
  "average loss trade": "averageLossTrade",
  "maximum consecutive wins ($)": "maxConsecutiveWins",
  "maximum consecutive losses ($)": "maxConsecutiveLosses",
  "maximal consecutive profit (count)": "maximalConsecutiveProfit",
  "maximal consecutive loss (count)": "maximalConsecutiveLoss",
  "average consecutive wins": "averageConsecutiveWins",
  "average consecutive losses": "averageConsecutiveLosses",
};

function parseSummarySheet(sheet: XLSX.WorkSheet): {
  summary: Partial<SummaryStats>;
  results: Partial<ResultStats>;
} | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const summary: Partial<SummaryStats> = {};
  const results: Partial<ResultStats> = {};
  let foundHeader = false;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const a = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    const b = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const metricRaw = a ? String((a as { v?: unknown }).v ?? "").trim() : "";
    const valueRaw = b != null && b !== undefined ? String((b as { v?: unknown }).v ?? "").trim() : "";
    const metricNorm = normalizeHeader(metricRaw);
    if (metricNorm === "metric" && normalizeHeader(String((b as { v?: unknown })?.v ?? "")) === "value") {
      foundHeader = true;
      continue;
    }
    if (!foundHeader || !metricNorm) continue;
    const summaryKey = SUMMARY_METRIC_TO_FIELD[metricNorm];
    const resultKey = SUMMARY_METRIC_TO_RESULT_FIELD[metricNorm];
    if (summaryKey !== undefined && valueRaw !== "") {
      (summary as Record<string, string>)[summaryKey] = valueRaw;
    }
    if (resultKey !== undefined && valueRaw !== "") {
      (results as Record<string, string>)[resultKey] = valueRaw;
    }
  }
  const hasSummary = Object.keys(summary).length > 0;
  const hasResults = Object.keys(results).length > 0;
  return hasSummary || hasResults ? { summary, results } : null;
}

function mergeSummary(
  base: SummaryStats,
  overrides: Partial<SummaryStats> | null
): SummaryStats {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

function mergeResults(
  base: ResultStats,
  overrides: Partial<ResultStats> | null
): ResultStats {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export function parseExcelFile(buffer: ArrayBuffer): ParsedReport {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetNames = workbook.SheetNames;
  const sheetNamesLower = sheetNames.map((n) => n.toLowerCase().trim());

  let positions: PositionRow[] = [];
  let deals: DealRow[] = [];
  let orders: OrderRow[] = [];
  let templateInputs: Partial<SummaryStats> | null = null;
  let templateSummary: { summary: Partial<SummaryStats>; results: Partial<ResultStats> } | null = null;

  const positionsSheetIndex = sheetNamesLower.findIndex((n) => n === "positions");
  const dealsSheetIndex = sheetNamesLower.findIndex(
    (n) => n === "deals_auto" || n === "deals"
  );
  const ordersSheetIndex = sheetNamesLower.findIndex(
    (n) => n === "orders_auto" || n === "orders"
  );
  const inputsSheetIndex = sheetNamesLower.findIndex((n) => n === "inputs");
  const summarySheetIndex = sheetNamesLower.findIndex((n) => n === "summary");

  const POSITION_DATE_FIELDS: (keyof PositionRow)[] = ["openTime", "closeTime"];
  const DEAL_DATE_FIELDS: (keyof DealRow)[] = ["time"];
  const ORDER_DATE_FIELDS: (keyof OrderRow)[] = ["openTime", "time"];

  if (positionsSheetIndex >= 0) {
    const sheet = workbook.Sheets[sheetNames[positionsSheetIndex]];
    const headerInfo = findHeaderRow(sheet);
    if (headerInfo) {
      const data = sheetToData(sheet, headerInfo.rowIndex);
      const parsed = parseRows<PositionRow>(
        data,
        headerInfo.headers,
        POSITION_HEADER_MAP,
        POSITION_DATE_FIELDS
      );
      if (parsed.length > 0) positions = parsed;
    }
  }
  if (dealsSheetIndex >= 0) {
    const sheet = workbook.Sheets[sheetNames[dealsSheetIndex]];
    const headerInfo = findHeaderRow(sheet);
    if (headerInfo) {
      const data = sheetToData(sheet, headerInfo.rowIndex);
      const parsed = parseRows<DealRow>(
        data,
        headerInfo.headers,
        DEAL_HEADER_MAP,
        DEAL_DATE_FIELDS
      );
      if (parsed.length > 0) deals = parsed;
    }
  }
  if (ordersSheetIndex >= 0) {
    const sheet = workbook.Sheets[sheetNames[ordersSheetIndex]];
    let headerInfo = findHeaderRow(sheet);
    // Fallback: template often has title row 0, blank row 1, header on row 2
    if (!headerInfo) {
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
      if (range.e.r >= 3) {
        const row2Cells: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r: 2, c });
          const cell = sheet[addr];
          row2Cells.push(cell ? String(cell.v).trim() : "");
        }
        const norms = row2Cells.map(normalizeHeader);
        const hasOpenTime =
          norms.includes("open time") || norms.includes("opentime");
        if (norms.includes("order") && hasOpenTime) {
          headerInfo = { rowIndex: 2, headers: row2Cells };
        }
      }
    }
    if (headerInfo) {
      const data = sheetToData(sheet, headerInfo.rowIndex);
      const parsed = parseRows<OrderRow>(
        data,
        headerInfo.headers,
        ORDER_HEADER_MAP,
        ORDER_DATE_FIELDS
      );
      if (parsed.length > 0) orders = parsed;
    }
  }

  // If named sheets didn't yield data, fall back to iterating all sheets
  if (positions.length === 0 || deals.length === 0 || orders.length === 0) {
    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const headerInfo = findHeaderRow(sheet);
      if (!headerInfo) continue;
      const { rowIndex, headers } = headerInfo;
      const sheetType = detectSheetType(headers);
      const data = sheetToData(sheet, rowIndex);
      const normalizedName = sheetName.toLowerCase().trim();
      if (sheetType === "deals" || normalizedName.includes("deal")) {
        const parsed = parseRows<DealRow>(
          data,
          headers,
          DEAL_HEADER_MAP,
          DEAL_DATE_FIELDS
        );
        if (parsed.length > 0 && deals.length === 0) deals = parsed;
      } else if (sheetType === "positions" || normalizedName.includes("position")) {
        const parsed = parseRows<PositionRow>(
          data,
          headers,
          POSITION_HEADER_MAP,
          POSITION_DATE_FIELDS
        );
        if (parsed.length > 0 && positions.length === 0) positions = parsed;
      } else if (
        sheetType === "orders" ||
        normalizedName.includes("order")
      ) {
        const parsed = parseRows<OrderRow>(
          data,
          headers,
          ORDER_HEADER_MAP,
          ORDER_DATE_FIELDS
        );
        if (parsed.length > 0 && orders.length === 0) orders = parsed;
      } else {
        const dealsAttempt = parseRows<DealRow>(
          data,
          headers,
          DEAL_HEADER_MAP,
          DEAL_DATE_FIELDS
        );
        const positionsAttempt = parseRows<PositionRow>(
          data,
          headers,
          POSITION_HEADER_MAP,
          POSITION_DATE_FIELDS
        );
        if (dealsAttempt.length > 0 && deals.length === 0) deals = dealsAttempt;
        if (positionsAttempt.length > 0 && positions.length === 0)
          positions = positionsAttempt;
      }
    }
  }

  // Parse Inputs and Summary for template overrides
  if (inputsSheetIndex >= 0) {
    templateInputs = parseInputsSheet(workbook.Sheets[sheetNames[inputsSheetIndex]]);
  }
  if (summarySheetIndex >= 0) {
    templateSummary = parseSummarySheet(workbook.Sheets[sheetNames[summarySheetIndex]]);
  }

  const calculated = calculateStats(deals, positions);
  let summary: SummaryStats = mergeSummary(calculated.summary, templateInputs);
  summary = mergeSummary(summary, templateSummary?.summary ?? null);
  const results = mergeResults(
    calculated.results,
    templateSummary?.results ?? null
  );

  return { positions, deals, orders, summary, results };
}

export function parseCsvFile(text: string): ParsedReport {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return emptyReport();

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const sheetType = detectSheetType(headers);
  const data = lines.slice(1).map((line) =>
    line.split(",").map((c) => c.replace(/"/g, "").trim())
  );

  let positions: PositionRow[] = [];
  let deals: DealRow[] = [];

  if (sheetType === "deals") {
    deals = parseRows<DealRow>(data, headers, DEAL_HEADER_MAP, ["time"]);
  } else {
    positions = parseRows<PositionRow>(
      data,
      headers,
      POSITION_HEADER_MAP,
      ["openTime", "closeTime"]
    );
  }

  const { summary, results } = calculateStats(deals, positions);
  return { positions, deals, orders: [], summary, results };
}

function emptyReport(): ParsedReport {
  const { summary, results } = calculateStats([], []);
  return { positions: [], deals: [], orders: [], summary, results };
}
