"""
generate_mt5_statement.py
=========================
Skrip Python untuk menjana fail HTML Trading Statement MT5.
Fail output: MT5_Clone_Statement.html

CARA KERJA SKRIP INI (Panduan Belajar):
=========================================
  LANGKAH 1 → Takrifkan data (maklumat akaun + senarai trade)
  LANGKAH 2 → Kira statistik ringkasan (profit, balance, dsb.)
  LANGKAH 3 → Jana baris HTML untuk setiap trade
  LANGKAH 4 → Cantumkan semua blok HTML menjadi satu fail penuh
  LANGKAH 5 → Tulis ke fail .html
"""

# ============================================================
#  LANGKAH 1A — MAKLUMAT AKAUN (ACCOUNT HEADER INFO)
# ============================================================
# Maklumat ini akan dipaparkan di bahagian atas laporan,
# sama seperti "Name:", "Account:", "Company:", "Date:" dalam fail rujukan.

account_info = {
    "name"        : "Ahmad Trader",
    "account"     : "12345678",
    "currency"    : "USD",
    "server"      : "BrokerXYZ-Live",
    "type"        : "real",
    "hedge"       : "Hedge",
    "company"     : "Broker XYZ International",
    "leverage"    : "1:100",
    "report_date" : "2026.03.04 12:00",
}

# ============================================================
#  LANGKAH 1B — DEPOSIT PERMULAAN
# ============================================================
# Ini adalah modal awal sebelum sebarang trade dibuka.

initial_deposit = 100.00

# ============================================================
#  LANGKAH 1C — SENARAI DATA TRADE DUMMY (5 ENTRY)
# ============================================================
# Setiap trade disimpan sebagai satu "dictionary" Python.
# Kunci (key) dalam dictionary ini dipetakan terus ke lajur
# dalam jadual HTML nanti.
#
# LOGIK PENGIRAAN PROFIT (untuk semakan):
#   XAUUSD (GOLD), 0.01 lot  → 1 oz → profit = (close - open) × 1
#   EURUSD/GBPUSD, 0.01 lot  → 1,000 unit → profit = (close - open) × 1,000
#
# Untuk trade BUY  → Untung jika close_price > open_price
# Untuk trade SELL → Untung jika close_price < open_price

trades = [
    # ----------------------------------------------------------
    # Trade 1: XAUUSD — BUY
    # Pengiraan: (2853.50 - 2850.50) × 1 oz = +$3.00
    # ----------------------------------------------------------
    {
        "ticket"      : 100001001,
        "open_time"   : "2026.03.01 09:15:30",
        "symbol"      : "XAUUSD",
        "type"        : "buy",
        "volume"      : 0.01,
        "open_price"  : 2850.50,
        "sl"          : 2840.00,       # Stop Loss: 10.50 mata di bawah open
        "tp"          : 2860.00,       # Take Profit: 9.50 mata di atas open
        "close_time"  : "2026.03.01 09:45:22",
        "close_price" : 2853.50,       # Tutup di tengah jalan (manual close)
        "commission"  : 0.00,
        "swap"        : 0.00,
        "profit"      : 3.00,
    },

    # ----------------------------------------------------------
    # Trade 2: EURUSD — BUY
    # Pengiraan: (1.08600 - 1.08200) × 1,000 = 0.004 × 1,000 = +$4.00
    # ----------------------------------------------------------
    {
        "ticket"      : 100001002,
        "open_time"   : "2026.03.01 10:20:15",
        "symbol"      : "EURUSD",
        "type"        : "buy",
        "volume"      : 0.01,
        "open_price"  : 1.08200,
        "sl"          : 1.07800,       # 40 pip di bawah open
        "tp"          : 1.08600,       # 40 pip di atas open (kena TP)
        "close_time"  : "2026.03.01 11:05:43",
        "close_price" : 1.08600,       # Tutup pada harga TP
        "commission"  : 0.00,
        "swap"        : 0.00,
        "profit"      : 4.00,
    },

    # ----------------------------------------------------------
    # Trade 3: GBPUSD — SELL
    # Pengiraan: (1.26900 - 1.26500) × 1,000 = 0.004 × 1,000 = +$4.00
    # ----------------------------------------------------------
    {
        "ticket"      : 100001003,
        "open_time"   : "2026.03.02 08:30:10",
        "symbol"      : "GBPUSD",
        "type"        : "sell",
        "volume"      : 0.01,
        "open_price"  : 1.26900,
        "sl"          : 1.27300,       # 40 pip di atas open (risiko untuk SELL)
        "tp"          : 1.26500,       # 40 pip di bawah open (kena TP)
        "close_time"  : "2026.03.02 09:10:55",
        "close_price" : 1.26500,       # Tutup pada harga TP
        "commission"  : 0.00,
        "swap"        : 0.00,
        "profit"      : 4.00,
    },

    # ----------------------------------------------------------
    # Trade 4: XAUUSD — BUY
    # Pengiraan: (2875.00 - 2870.00) × 1 oz = +$5.00
    # ----------------------------------------------------------
    {
        "ticket"      : 100001004,
        "open_time"   : "2026.03.02 14:05:30",
        "symbol"      : "XAUUSD",
        "type"        : "buy",
        "volume"      : 0.01,
        "open_price"  : 2870.00,
        "sl"          : 2858.00,       # 12 mata di bawah open
        "tp"          : 2882.00,       # 12 mata di atas open
        "close_time"  : "2026.03.02 14:35:12",
        "close_price" : 2875.00,       # Tutup manual sebelum kena TP
        "commission"  : 0.00,
        "swap"        : 0.00,
        "profit"      : 5.00,
    },

    # ----------------------------------------------------------
    # Trade 5: EURUSD — SELL
    # Pengiraan: (1.09100 - 1.08650) × 1,000 = 0.0045 × 1,000 = +$4.50
    # ----------------------------------------------------------
    {
        "ticket"      : 100001005,
        "open_time"   : "2026.03.03 07:45:00",
        "symbol"      : "EURUSD",
        "type"        : "sell",
        "volume"      : 0.01,
        "open_price"  : 1.09100,
        "sl"          : 1.09500,       # 40 pip di atas open
        "tp"          : 1.08650,       # 45 pip di bawah open (kena TP)
        "close_time"  : "2026.03.03 08:20:30",
        "close_price" : 1.08650,       # Tutup pada harga TP
        "commission"  : 0.00,
        "swap"        : 0.00,
        "profit"      : 4.50,
    },
]


# ============================================================
#  LANGKAH 2 — PENGIRAAN STATISTIK RINGKASAN
# ============================================================
# Semua nilai ini akan dipaparkan dalam bahagian "Results"
# dan "Balance" di bawah jadual trade.

total_profit     = sum(t["profit"] for t in trades)
total_commission = sum(t["commission"] for t in trades)
total_swap       = sum(t["swap"] for t in trades)

# Gross Profit = jumlah semua trade yang UNTUNG sahaja
gross_profit = sum(t["profit"] for t in trades if t["profit"] > 0)

# Gross Loss = jumlah semua trade yang RUGI sahaja (nilai negatif)
gross_loss   = sum(t["profit"] for t in trades if t["profit"] < 0)

# Baki akhir = deposit permulaan + semua keuntungan/kerugian
final_balance = initial_deposit + total_profit

total_trades   = len(trades)
winning_trades = sum(1 for t in trades if t["profit"] > 0)
losing_trades  = sum(1 for t in trades if t["profit"] <= 0)

# Profit Factor: nisbah gross profit vs gross loss
# Jika tiada trade rugi, profit factor tidak berkenaan
profit_factor = (
    round(gross_profit / abs(gross_loss), 2) if gross_loss != 0 else 0.00
)

# Expected Payoff: purata keuntungan per trade
expected_payoff = round(total_profit / total_trades, 2) if total_trades > 0 else 0.00

# Statistik long vs short
short_trades     = [t for t in trades if t["type"] == "sell"]
long_trades      = [t for t in trades if t["type"] == "buy"]
short_wins       = sum(1 for t in short_trades if t["profit"] > 0)
long_wins        = sum(1 for t in long_trades  if t["profit"] > 0)
short_win_pct    = (short_wins / len(short_trades) * 100) if short_trades else 0.0
long_win_pct     = (long_wins  / len(long_trades)  * 100) if long_trades  else 0.0


# ============================================================
#  LANGKAH 3 — FUNGSI PEMBANTU (HELPER FUNCTIONS)
# ============================================================

def format_price(symbol: str, price: float) -> str:
    """
    Format harga mengikut konvensyen MT5:
      - XAUUSD (GOLD): 2 titik perpuluhan  → contoh: 2850.50
      - Pasangan Forex (EURUSD, GBPUSD): 5 titik perpuluhan → contoh: 1.08200
    """
    if "XAU" in symbol.upper() or "GOLD" in symbol.upper():
        return f"{price:.2f}"
    else:
        return f"{price:.5f}"


def generate_trade_row(trade: dict, row_index: int) -> str:
    """
    Jana satu baris <tr> HTML untuk satu trade.

    Struktur lajur (14 lajur visual) mengikut format MT5 Positions:
    ┌────────────────┬──────────┬────────┬──────┬────────┬─────────────┬─────┬─────┬────────────────┬─────────────┬────────────┬──────┬────────────────┐
    │ Open Time (1)  │ Ticket(2)│Symbol  │ Type │ Volume │ Open Price  │ S/L │ T/P │ Close Time (9) │ Close Price │ Commission │ Swap │ Profit (13-14) │
    └────────────────┴──────────┴────────┴──────┴────────┴─────────────┴─────┴─────┴────────────────┴─────────────┴────────────┴──────┴────────────────┘

    NOTA TEKNIKAL: Baris data mempunyai satu sel tersembunyi <td class="hidden" colspan="8">
    yang mengandungi CSS "display:none". Walaupun sel ini secara logik mengambil 8 ruang lajur,
    CSS display:none membuatkan ia hilang sepenuhnya dari tataletak visual. Ini menyebabkan
    14 lajur yang kelihatan tetap betul dalam paparan.

    Warna baris berselang-seli (alternating row colors):
      - Baris genap  (index 0, 2, 4...): #FFFFFF (putih)
      - Baris ganjil (index 1, 3...):    #F7F7F7 (kelabu muda)
    """
    bg_color = "#FFFFFF" if row_index % 2 == 0 else "#F7F7F7"

    open_price_str  = format_price(trade["symbol"], trade["open_price"])
    close_price_str = format_price(trade["symbol"], trade["close_price"])
    sl_str          = format_price(trade["symbol"], trade["sl"]) if trade["sl"] else ""
    tp_str          = format_price(trade["symbol"], trade["tp"]) if trade["tp"] else ""
    profit_str      = f"{trade['profit']:.2f}"

    return f"""
        <tr bgcolor="{bg_color}" align="right">
            <td>{trade["open_time"]}</td>
            <td>{trade["ticket"]}</td>
            <td>{trade["symbol"]}</td>
            <td>{trade["type"]}</td>
            <td class="hidden" colspan="8"></td>
            <td class="">{trade["volume"]:.2f}</td>
            <td class="">{open_price_str}</td>
            <td class="">{sl_str}</td>
            <td class="">{tp_str}</td>
            <td class="">{trade["close_time"]}</td>
            <td class="">{close_price_str}</td>
            <td class="">{trade["commission"]:.2f}</td>
            <td class="">{trade["swap"]:.2f}</td>
            <td colspan="2">{profit_str}</td>
        </tr>"""


# ============================================================
#  LANGKAH 4 — JANA HTML PENUH
# ============================================================

def generate_html() -> str:
    """
    Menjana keseluruhan rentetan HTML untuk Trading Statement.
    Fungsi ini menggabungkan:
      1. DOCTYPE + <head> (CSS styling)
      2. Header akaun (Name, Account, Company, Date)
      3. Spacer lajur (column width definers)
      4. Header jadual "Positions"
      5. Semua baris trade
      6. Baris jumlah (totals)
      7. Bahagian baki akaun (Balance section)
      8. Bahagian keputusan statistik (Results section)
    """

    # --- 4a. Jana semua baris trade ---
    trade_rows_html = ""
    for i, trade in enumerate(trades):
        trade_rows_html += generate_trade_row(trade, i)

    # --- 4b. Baris Jumlah (Totals Row) ---
    # Format: [8 lajur kosong] | commission | swap | 0.00 | net_profit | final_balance | kosong
    # Ini mengikut format MT5 asal di mana baris jumlah disejajarkan ke kanan jadual.
    totals_row = f"""
        <tr align="right">
            <td nowrap colspan="8" style="height: 30px"></td>
            <td nowrap><b>{total_commission:.2f}</b></td>
            <td nowrap><b>{total_swap:.2f}</b></td>
            <td nowrap><b>0.00</b></td>
            <td nowrap><b>{total_profit:.2f}</b></td>
            <td nowrap><b>{final_balance:.2f}</b></td>
            <td nowrap></td>
        </tr>"""

    # --- 4c. Kumpulkan keseluruhan HTML ---
    acct = account_info

    html = f"""<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
  <head>
    <title>{acct["account"]}: {acct["name"]} - Trade History Report</title>
    <meta name="generator" content="client terminal">
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
    .mspt   {{ mso-number-format:\\#\\,\\#\\#0\\.00;  }}
    .hidden {{ display: none; }}
    body    {{margin:1px;}}
    //-->
    </style>
  </head>
<body>
<div align="center">
    <table cellspacing="1" cellpadding="3" border="0">

        <!-- ====================================================
             BLOK 1: HEADER AKAUN
             Memaparkan maklumat pemilik akaun di bahagian atas.
             ==================================================== -->
        <tr align="center">
            <td colspan="14"><div style="font: 14pt Tahoma"><b>Trade History Report</b><br></div></td>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Name:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>{acct["name"]}</b></th>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Account:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>{acct["account"]}&nbsp;({acct["currency"]},&nbsp;{acct["server"]},&nbsp;{acct["type"]},&nbsp;{acct["hedge"]})</b></th>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Company:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>{acct["company"]}</b></th>
        </tr>
        <tr align="left">
            <th colspan="4" nowrap align="right" style="width: 220px; height: 20px">Date:</th>
            <th colspan="10" nowrap align="left" style="width: 220px; height: 20px"><b>{acct["report_date"]}</b></th>
        </tr>

        <!-- ====================================================
             BLOK 2: SPACER LAJUR
             Baris kosong ini menentukan lebar setiap lajur (14 lajur).
             Browser menggunakan nilai "width" ini sebagai panduan
             untuk semua baris jadual yang berikutnya.
             ==================================================== -->
        <tr>
            <td nowrap style="width: 140px; height: 10px"></td>  <!-- Lajur 1:  Open Time        -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 2:  Position/Ticket   -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 3:  Symbol            -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 4:  Type              -->
            <td nowrap style="width:  70px;"></td>               <!-- Lajur 5:  Volume            -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 6:  Open Price        -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 7:  S/L               -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 8:  T/P               -->
            <td nowrap style="width: 140px;"></td>               <!-- Lajur 9:  Close Time        -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 10: Close Price       -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 11: Commission        -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 12: Swap              -->
            <td nowrap style="width:  60px;"></td>               <!-- Lajur 13: Profit (bahagian A) -->
            <td nowrap style="width: 100px;"></td>               <!-- Lajur 14: Profit (bahagian B) -->
        </tr>

        <!-- ====================================================
             BLOK 3: TAJUK BAHAGIAN "POSITIONS"
             Memaparkan tajuk bahagian dan label setiap lajur.
             bgcolor="#E5F0FC" = biru muda (warna header MT5)
             ==================================================== -->
        <tr align="center">
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

        <!-- ====================================================
             BLOK 4: BARIS DATA TRADE
             Setiap baris dijanakan oleh fungsi generate_trade_row().
             Perhatikan sel tersembunyi <td class="hidden" colspan="8">
             yang menjadi ciri khas format MT5 Positions.
             ==================================================== -->
{trade_rows_html}

        <!-- ====================================================
             BLOK 5: BARIS JUMLAH KESELURUHAN (TOTALS ROW)
             Menunjukkan: Commission | Swap | 0.00 | Net Profit | Final Balance
             ==================================================== -->
{totals_row}

        <!-- Spacer antara jadual trade dan bahagian baki -->
        <tr align="right">
            <td colspan="13" style="height: 10px"></td>
        </tr>

        <!-- ====================================================
             BLOK 6: BAHAGIAN BAKI AKAUN (ACCOUNT BALANCE SECTION)
             Menunjukkan ringkasan kewangan akaun semasa.
             ==================================================== -->
        <tr align="right">
            <td colspan="3" style="height: 20px">Balance:</td>
            <td colspan="2"><b>{final_balance:.2f}</b></td>
            <td></td>
            <td colspan="3">Free Margin:</td>
            <td colspan="2"><b>{final_balance:.2f}</b></td>
        </tr>
        <tr align="right">
            <td colspan="3" style="height: 20px">Credit Facility:</td>
            <td colspan="2"><b>0.00</b></td>
            <td></td>
            <td colspan="3">Margin:</td>
            <td colspan="2"><b>0.00</b></td>
        </tr>
        <tr align="right">
            <td colspan="3" style="height: 20px">Floating P/L:</td>
            <td colspan="2"><b>0.00</b></td>
            <td></td>
            <td colspan="3">Margin Level:</td>
            <td colspan="2"><b>0.00%</b></td>
        </tr>
        <tr align="right">
            <td colspan="3" style="height: 20px">Equity:</td>
            <td colspan="2"><b>{final_balance:.2f}</b></td>
        </tr>

        <!-- Spacer antara bahagian baki dan keputusan -->
        <tr align="right">
            <td colspan="13" style="height: 10px"></td>
        </tr>

        <!-- ====================================================
             BLOK 7: BAHAGIAN KEPUTUSAN STATISTIK (RESULTS SECTION)
             Menunjukkan analisis prestasi keseluruhan trading.
             ==================================================== -->
        <tr>
            <td colspan="13" align="center"><div style="font: 10pt Tahoma"><b>Results</b></div></td>
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
        <tr>
            <td nowrap style="height: 10px"></td>
        </tr>
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
            <td nowrap><b>{winning_trades} ({winning_trades / total_trades * 100:.2f}%)</b></td>
            <td nowrap colspan="3">Loss Trades (% of total):</td>
            <td nowrap colspan="2"><b>{losing_trades} ({losing_trades / total_trades * 100:.2f}%)</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Largest profit trade:</td>
            <td nowrap><b>{max(t["profit"] for t in trades):.2f}</b></td>
            <td nowrap colspan="3">Largest loss trade:</td>
            <td nowrap colspan="2"><b>{min(t["profit"] for t in trades):.2f}</b></td>
        </tr>
        <tr align="right">
            <td nowrap colspan="4"></td>
            <td nowrap colspan="3">Average profit trade:</td>
            <td nowrap><b>{gross_profit / winning_trades if winning_trades > 0 else 0:.2f}</b></td>
            <td nowrap colspan="3">Average loss trade:</td>
            <td nowrap colspan="2"><b>{gross_loss / losing_trades if losing_trades > 0 else 0:.2f}</b></td>
        </tr>
        <tr>
            <td nowrap style="height: 10px"></td>
        </tr>
    </table>
</div>
</body>
</html>"""

    return html


# ============================================================
#  LANGKAH 5 — TULIS KE FAIL HTML
# ============================================================

if __name__ == "__main__":
    output_filename = "MT5_Clone_Statement.html"

    html_content = generate_html()

    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(html_content)

    # Paparan ringkasan di terminal selepas fail berjaya ditulis
    print("=" * 52)
    print("  MT5 Clone Statement — Jana Berjaya!")
    print("=" * 52)
    print(f"  Fail output    : {output_filename}")
    print(f"  Deposit Awal   : ${initial_deposit:.2f}")
    print(f"  Jumlah Trade   : {total_trades}")
    print(f"  Gross Profit   : ${gross_profit:.2f}")
    print(f"  Gross Loss     : ${gross_loss:.2f}")
    print(f"  Total Profit   : ${total_profit:.2f}")
    print(f"  Baki Akhir     : ${final_balance:.2f}")
    print("=" * 52)
    print("  Buka fail HTML dalam browser untuk melihat laporan.")
    print("=" * 52)
