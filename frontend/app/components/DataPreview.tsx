"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { ParsedReport } from "@/app/lib/types";
import { prepareChartData, calcDrawdownStats } from "@/app/lib/chartData";
import { BalanceChart } from "./BalanceChart";

interface DataPreviewProps {
  report: ParsedReport;
}

export function DataPreview({ report }: DataPreviewProps) {
  const { positions, deals, orders, summary, results } = report;
  const chartData = prepareChartData(deals, positions);
  const ddStats = calcDrawdownStats(chartData);

  return (
    <div className="space-y-4">
      <Tabs defaultValue={chartData.length >= 2 ? "chart" : deals.length > 0 ? "deals" : "positions"}>
        <TabsList className="w-full">
          <TabsTrigger value="chart" className="flex-1">
            Graf Balance
          </TabsTrigger>
          <TabsTrigger value="positions" className="flex-1 gap-2">
            Positions
            <Badge variant="secondary">{positions.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="deals" className="flex-1 gap-2">
            Deals
            <Badge variant="secondary">{deals.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex-1 gap-2">
            Orders
            <Badge variant="secondary">{orders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex-1">
            Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <BalanceChart data={chartData} stats={ddStats} />
        </TabsContent>

        <TabsContent value="positions">
          {positions.length === 0 ? (
            <EmptyState message="Tiada data Positions ditemui." />
          ) : (
            <DataTable
              headers={[
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
              ]}
              rows={positions.map((p) => [
                p.openTime,
                p.position,
                p.symbol,
                p.type,
                p.volume,
                p.openPrice,
                p.sl,
                p.tp,
                p.closeTime,
                p.closePrice,
                p.commission,
                p.swap,
                p.profit,
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="deals">
          {deals.length === 0 ? (
            <EmptyState message="Tiada data Deals ditemui." />
          ) : (
            <DataTable
              headers={[
                "Time",
                "Deal",
                "Symbol",
                "Type",
                "Direction",
                "Volume",
                "Price",
                "Order",
                "Commission",
                "Fee",
                "Swap",
                "Profit",
                "Balance",
                "Comment",
              ]}
              rows={deals.map((d) => [
                d.time,
                d.deal,
                d.symbol,
                d.type,
                d.direction,
                d.volume,
                d.price,
                d.order,
                d.commission,
                d.fee,
                d.swap,
                d.profit,
                d.balance,
                d.comment,
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="orders">
          {orders.length === 0 ? (
            <EmptyState message="Tiada data Orders ditemui." />
          ) : (
            <DataTable
              headers={[
                "Open Time",
                "Order",
                "Symbol",
                "Type",
                "Volume",
                "Price",
                "S/L",
                "T/P",
                "Time",
                "State",
                "Comment",
              ]}
              rows={orders.map((o) => [
                o.openTime,
                o.order,
                o.symbol,
                o.type,
                o.volume,
                o.price,
                o.sl,
                o.tp,
                o.time,
                o.state,
                o.comment,
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="summary">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Ringkasan Akaun"
              items={[
                { label: "Balance", value: summary.balance },
                { label: "Equity", value: summary.equity },
                { label: "Free Margin", value: summary.freeMargin },
                { label: "Margin", value: summary.margin },
                { label: "Credit Facility", value: summary.creditFacility },
                { label: "Margin Level", value: summary.marginLevel },
              ]}
            />
            <SummaryCard
              title="Keputusan Dagangan"
              items={[
                { label: "Total Net Profit", value: results.totalNetProfit },
                { label: "Gross Profit", value: results.grossProfit },
                { label: "Gross Loss", value: results.grossLoss },
                { label: "Profit Factor", value: results.profitFactor },
                { label: "Total Trades", value: results.totalTrades },
                { label: "Short Trades (won %)", value: results.shortTradesWon },
                { label: "Long Trades (won %)", value: results.longTradesWon },
              ]}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-max text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, i) => (
            <tr
              key={i}
              className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-1.5 whitespace-nowrap text-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && (
        <p className="px-3 py-2 text-xs text-muted-foreground border-t">
          Menunjukkan 100 daripada {rows.length} baris.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <dl className="space-y-2">
        {items.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xs font-medium tabular-nums">{value || "0.00"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
