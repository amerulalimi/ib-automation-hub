export interface AccountInfo {
  name: string;
  account: string;
  company: string;
  date: string;
}

export interface PositionRow {
  openTime: string;
  position: string;
  symbol: string;
  type: string;
  volume: string;
  openPrice: string;
  sl: string;
  tp: string;
  closeTime: string;
  closePrice: string;
  commission: string;
  swap: string;
  profit: string;
}

export interface DealRow {
  time: string;
  deal: string;
  symbol: string;
  type: string;
  direction: string;
  volume: string;
  price: string;
  order: string;
  commission: string;
  fee: string;
  swap: string;
  profit: string;
  balance: string;
  comment: string;
}

export interface OrderRow {
  openTime: string;
  order: string;
  symbol: string;
  type: string;
  volume: string;
  price: string;
  sl: string;
  tp: string;
  time: string;
  state: string;
  comment: string;
}

export interface SummaryStats {
  balance: string;
  creditFacility: string;
  floatingPL: string;
  equity: string;
  freeMargin: string;
  margin: string;
  marginLevel: string;
}

export interface ResultStats {
  totalNetProfit: string;
  grossProfit: string;
  grossLoss: string;
  profitFactor: string;
  expectedPayoff: string;
  recoveryFactor: string;
  sharpeRatio: string;
  balanceDrawdownAbsolute: string;
  balanceDrawdownMaximal: string;
  balanceDrawdownRelative: string;
  totalTrades: string;
  shortTradesWon: string;
  longTradesWon: string;
  profitTrades: string;
  lossTrades: string;
  largestProfitTrade: string;
  largestLossTrade: string;
  averageProfitTrade: string;
  averageLossTrade: string;
  maxConsecutiveWins: string;
  maxConsecutiveLosses: string;
  maximalConsecutiveProfit: string;
  maximalConsecutiveLoss: string;
  averageConsecutiveWins: string;
  averageConsecutiveLosses: string;
}

export interface ParsedReport {
  positions: PositionRow[];
  deals: DealRow[];
  orders: OrderRow[];
  summary: SummaryStats;
  results: ResultStats;
}
