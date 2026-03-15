"""MT5-style HTML report builder (positions table + stats)."""


def _fmt_price(symbol: str, price: float) -> str:
    """Format harga ikut konvensyen MT5."""
    sym = symbol.upper()
    if "XAU" in sym or "XAG" in sym or "GOLD" in sym:
        return f"{price:.2f}"
    if "JPY" in sym:
        return f"{price:.3f}"
    return f"{price:.5f}"


def _trade_row(trade: dict, idx: int) -> str:
    bg = "#FFFFFF" if idx % 2 == 0 else "#F7F7F7"
    op = _fmt_price(trade["symbol"], trade["open_price"])
    cp = _fmt_price(trade["symbol"], trade["close_price"])
    sl = _fmt_price(trade["symbol"], trade["sl"]) if trade.get("sl") else ""
    tp = _fmt_price(trade["symbol"], trade["tp"]) if trade.get("tp") else ""
    profit_color = "color:#008000" if trade["profit"] >= 0 else "color:#CC0000"
    return f"""
        <tr bgcolor="{bg}" align="right">
            <td>{trade["open_time"]}</td>
            <td>{trade["ticket"]}</td>
            <td>{trade["symbol"]}</td>
            <td>{trade["type"]}</td>
            <td class="hidden" colspan="8"></td>
            <td>{trade["volume"]:.2f}</td>
            <td>{op}</td>
            <td>{sl}</td>
            <td>{tp}</td>
            <td>{trade["close_time"]}</td>
            <td>{cp}</td>
            <td>{trade["commission"]:.2f}</td>
            <td>{trade["swap"]:.2f}</td>
            <td colspan="2" style="{profit_color}"><b>{trade["profit"]:.2f}</b></td>
        </tr>"""


def build_html(trades: list, acct: dict, initial_balance: float) -> str:
    """
    Menjana keseluruhan HTML statement MT5 (format clone asal).
    Semua statistik dikira secara automatik dalam Python.
    """
    total_profit = sum(t["profit"] for t in trades)
    total_commission = sum(t["commission"] for t in trades)
    total_swap = sum(t["swap"] for t in trades)
    gross_profit = sum(t["profit"] for t in trades if t["profit"] > 0)
    gross_loss = sum(t["profit"] for t in trades if t["profit"] < 0)
    final_balance = initial_balance + total_profit
    total_trades = len(trades)
    winning_trades = sum(1 for t in trades if t["profit"] > 0)
    losing_trades = sum(1 for t in trades if t["profit"] <= 0)
    profit_factor = round(gross_profit / abs(gross_loss), 2) if gross_loss != 0 else 0.00
    expected_payoff = round(total_profit / total_trades, 2) if total_trades > 0 else 0.00
    short_trades = [t for t in trades if t["type"] == "sell"]
    long_trades = [t for t in trades if t["type"] == "buy"]
    short_wins = sum(1 for t in short_trades if t["profit"] > 0)
    long_wins = sum(1 for t in long_trades if t["profit"] > 0)
    short_win_pct = (short_wins / len(short_trades) * 100) if short_trades else 0.0
    long_win_pct = (long_wins / len(long_trades) * 100) if long_trades else 0.0
    avg_profit = gross_profit / winning_trades if winning_trades > 0 else 0.0
    avg_loss = gross_loss / losing_trades if losing_trades > 0 else 0.0
    largest_profit = max((t["profit"] for t in trades), default=0.0)
    largest_loss = min((t["profit"] for t in trades), default=0.0)
    win_pct_total = winning_trades / total_trades * 100 if total_trades > 0 else 0
    loss_pct_total = losing_trades / total_trades * 100 if total_trades > 0 else 0

    trade_rows = "".join(_trade_row(t, i) for i, t in enumerate(trades))

    return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
  <head>
    <title>{acct["account"]}: {acct["name"]} - Trade History Report</title>
    <meta name="generator" content="MT5 Report Generator v3">
    <style type="text/css">
    <!--
    @media screen {{
      td {{ font: 8pt  Tahoma,Arial; }}
      th {{ font: 10pt Tahoma,Arial; }}
    }}
    @media print {{
      td {{ font: 7pt Tahoma,Arial; }}
      th {{ font: 9pt Tahoma,Arial; }}
    }}
    .msdate {{ mso-number-format:"General Date"; }}
    .mspt   {{ mso-number-format:\\#\\,\\#\\#0\\.00; }}
    .hidden {{ display: none; }}
    body    {{ margin: 1px; }}
    //-->
    </style>
  </head>
<body>
<div align="center">
  <table cellspacing="1" cellpadding="3" border="0">

    <!-- BLOK 1: HEADER AKAUN -->
    <tr align="center">
      <td colspan="14"><div style="font: 14pt Tahoma"><b>Trade History Report</b><br></div></td>
    </tr>
    <tr align="left">
      <th colspan="4" nowrap align="right" style="width:220px;height:20px">Name:</th>
      <th colspan="10" nowrap align="left"  style="width:220px;height:20px"><b>{acct["name"]}</b></th>
    </tr>
    <tr align="left">
      <th colspan="4" nowrap align="right" style="width:220px;height:20px">Account:</th>
      <th colspan="10" nowrap align="left"  style="width:220px;height:20px"><b>{acct["account"]}&nbsp;(USD,&nbsp;{acct["server"]},&nbsp;real,&nbsp;Hedge)</b></th>
    </tr>
    <tr align="left">
      <th colspan="4" nowrap align="right" style="width:220px;height:20px">Company:</th>
      <th colspan="10" nowrap align="left"  style="width:220px;height:20px"><b>{acct["company"]}</b></th>
    </tr>
    <tr align="left">
      <th colspan="4" nowrap align="right" style="width:220px;height:20px">Date:</th>
      <th colspan="10" nowrap align="left"  style="width:220px;height:20px"><b>{acct["report_date"]}</b></th>
    </tr>

    <!-- BLOK 2: SPACER LAJUR -->
    <tr>
      <td nowrap style="width:140px;height:10px"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:70px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:140px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:60px;"></td>
      <td nowrap style="width:100px;"></td>
    </tr>

    <!-- BLOK 3: TAJUK POSITIONS -->
    <tr align="center">
      <th colspan="14" style="height:25px"><div style="font:10pt Tahoma"><b>Positions</b></div></th>
    </tr>
    <tr align="center" bgcolor="#E5F0FC">
      <td nowrap style="height:30px"><b>Time</b></td>
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

    <!-- BLOK 4: BARIS DATA TRADE -->
    {trade_rows}

    <!-- BLOK 5: BARIS JUMLAH -->
    <tr align="right">
      <td nowrap colspan="8" style="height:30px"></td>
      <td nowrap><b>{total_commission:.2f}</b></td>
      <td nowrap><b>{total_swap:.2f}</b></td>
      <td nowrap><b>0.00</b></td>
      <td nowrap><b>{total_profit:.2f}</b></td>
      <td nowrap><b>{final_balance:.2f}</b></td>
      <td nowrap></td>
    </tr>
    <tr align="right"><td colspan="13" style="height:10px"></td></tr>

    <!-- BLOK 6: BAKI AKAUN -->
    <tr align="right">
      <td colspan="3" style="height:20px">Balance:</td>
      <td colspan="2"><b>{final_balance:.2f}</b></td>
      <td></td>
      <td colspan="3">Free Margin:</td>
      <td colspan="2"><b>{final_balance:.2f}</b></td>
    </tr>
    <tr align="right">
      <td colspan="3" style="height:20px">Credit Facility:</td>
      <td colspan="2"><b>0.00</b></td>
      <td></td>
      <td colspan="3">Margin:</td>
      <td colspan="2"><b>0.00</b></td>
    </tr>
    <tr align="right">
      <td colspan="3" style="height:20px">Floating P/L:</td>
      <td colspan="2"><b>0.00</b></td>
      <td></td>
      <td colspan="3">Margin Level:</td>
      <td colspan="2"><b>0.00%</b></td>
    </tr>
    <tr align="right">
      <td colspan="3" style="height:20px">Equity:</td>
      <td colspan="2"><b>{final_balance:.2f}</b></td>
    </tr>
    <tr align="right"><td colspan="13" style="height:10px"></td></tr>
    <tr align="center">
      <th colspan="13"><img src="ReportHistory-191241505.png" title="Balance graph" width=820 height=200 border=0 alt="Graph"></th>
    </tr>
    <!-- BLOK 7: RESULTS -->
    <tr>
      <td colspan="13" align="center"><div style="font:10pt Tahoma"><b>Results</b></div></td>
    </tr>
    <tr align="right">
      <td nowrap colspan="3">Total Net Profit:</td>
      <td nowrap><b>{total_profit:.2f}</b></td>
      <td nowrap colspan="3">Gross Profit:</td>
      <td nowrap><b>{gross_profit:.2f}</b></td>
      <td nowrap colspan="3">Gross Loss:</td>
      <td nowrap colspan="2"><b>{gross_loss:.2f}</b></td>
    </tr>
    <tr align="right">
      <td nowrap colspan="3">Profit Factor:</td>
      <td nowrap><b>{profit_factor:.2f}</b></td>
      <td nowrap colspan="3">Expected Payoff:</td>
      <td nowrap><b>{expected_payoff:.2f}</b></td>
    </tr>
    <tr><td nowrap style="height:10px"></td></tr>
    <tr align="right">
      <td nowrap colspan="3">Total Trades:</td>
      <td nowrap><b>{total_trades}</b></td>
      <td nowrap colspan="3">Short Trades (won %):</td>
      <td nowrap><b>{len(short_trades)} ({short_win_pct:.2f}%)</b></td>
      <td nowrap colspan="3">Long Trades (won %):</td>
      <td nowrap colspan="2"><b>{len(long_trades)} ({long_win_pct:.2f}%)</b></td>
    </tr>
    <tr align="right">
      <td nowrap colspan="4"></td>
      <td nowrap colspan="3">Profit Trades (% of total):</td>
      <td nowrap><b>{winning_trades} ({win_pct_total:.2f}%)</b></td>
      <td nowrap colspan="3">Loss Trades (% of total):</td>
      <td nowrap colspan="2"><b>{losing_trades} ({loss_pct_total:.2f}%)</b></td>
    </tr>
    <tr align="right">
      <td nowrap colspan="4"></td>
      <td nowrap colspan="3">Largest profit trade:</td>
      <td nowrap><b>{largest_profit:.2f}</b></td>
      <td nowrap colspan="3">Largest loss trade:</td>
      <td nowrap colspan="2"><b>{largest_loss:.2f}</b></td>
    </tr>
    <tr align="right">
      <td nowrap colspan="4"></td>
      <td nowrap colspan="3">Average profit trade:</td>
      <td nowrap><b>{avg_profit:.2f}</b></td>
      <td nowrap colspan="3">Average loss trade:</td>
      <td nowrap colspan="2"><b>{avg_loss:.2f}</b></td>
    </tr>
    <tr><td nowrap style="height:10px"></td></tr>
  </table>
</div>
</body>
</html>"""
