"""Dummy trade generator for demo reports."""
import random
from datetime import datetime, timedelta
from typing import Optional

_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "XAGUSD"]

_BASE_PRICES: dict = {
    "XAUUSD": 2850.00,
    "EURUSD": 1.08500,
    "GBPUSD": 1.26500,
    "USDJPY": 149.500,
    "XAGUSD": 32.500,
}


def generate_dummy_trades(
    count: int = 10,
    symbol_filter: str = "",
    target_profit: float = 100.0,
    date_from_dt: Optional[datetime] = None,
    date_to_dt: Optional[datetime] = None,
) -> list:
    """
    Jana senarai trade dummy yang realistik.
    """
    n = max(1, min(50, count))
    sym_up = symbol_filter.upper()
    symbols = [sym_up] if sym_up and sym_up in _BASE_PRICES else _SYMBOLS

    if date_from_dt is None:
        date_from_dt = datetime.now() - timedelta(days=30)
    if date_to_dt is None:
        date_to_dt = datetime.now()

    weights = [random.uniform(0.6, 1.4) for _ in range(n)]
    total_w = sum(weights)
    profits = [round((w / total_w) * target_profit, 2) for w in weights]
    profits[-1] = round(target_profit - sum(profits[:-1]), 2)

    total_seconds = max(3600, (date_to_dt - date_from_dt).total_seconds())
    slot = total_seconds / n
    trades = []

    for i in range(n):
        symbol = random.choice(symbols)
        trade_type = random.choice(["buy", "sell"])
        base = _BASE_PRICES[symbol]
        profit = profits[i]
        sym_u = symbol.upper()

        if "XAU" in sym_u or "XAG" in sym_u:
            price_diff = abs(profit) if trade_type == "buy" else -abs(profit)
            open_price = round(base + random.uniform(-5, 5), 2)
            close_price = round(open_price + price_diff, 2)
            sl = round(open_price - 12, 2) if trade_type == "buy" else round(open_price + 12, 2)
            tp = round(open_price + 15, 2) if trade_type == "buy" else round(open_price - 15, 2)
        elif "JPY" in sym_u:
            price_diff = (abs(profit) / 1000) * 150
            open_price = round(base + random.uniform(-0.5, 0.5), 3)
            close_price = round(open_price + (price_diff if trade_type == "buy" else -price_diff), 3)
            sl = round(open_price - 0.5, 3) if trade_type == "buy" else round(open_price + 0.5, 3)
            tp = round(open_price + 0.5, 3) if trade_type == "buy" else round(open_price - 0.5, 3)
        else:
            price_diff = abs(profit) / 1000
            open_price = round(base + random.uniform(-0.002, 0.002), 5)
            close_price = round(open_price + (price_diff if trade_type == "buy" else -price_diff), 5)
            sl = round(open_price - 0.0040, 5) if trade_type == "buy" else round(open_price + 0.0040, 5)
            tp = round(open_price + 0.0040, 5) if trade_type == "buy" else round(open_price - 0.0040, 5)

        offset = i * slot + random.uniform(0, slot * 0.7)
        open_time = date_from_dt + timedelta(seconds=offset)
        close_time = open_time + timedelta(minutes=random.randint(20, 120))

        trades.append({
            "ticket": 100001001 + i,
            "open_time": open_time.strftime("%Y.%m.%d %H:%M:%S"),
            "symbol": symbol,
            "type": trade_type,
            "volume": 0.01,
            "open_price": open_price,
            "sl": sl,
            "tp": tp,
            "close_time": close_time.strftime("%Y.%m.%d %H:%M:%S"),
            "close_price": close_price,
            "commission": 0.00,
            "swap": 0.00,
            "profit": profit,
        })

    trades.sort(key=lambda t: t["open_time"])
    return trades
