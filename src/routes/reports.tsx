import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { useMemo } from "react";
import { AppShell, EmptyState, Panel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { exportItems } from "@/lib/export";
import {
  CONDITIONS,
  ConditionBar,
  fmt,
  formatDay,
  pct,
  sumCounts,
  Swatch,
  toneText,
  type Counts,
} from "@/lib/format";
import { requireSession } from "@/lib/guard";
import { getInventoryDashboard, type InventoryItem } from "@/lib/inventory.functions";

export const Route = createFileRoute("/reports")({
  beforeLoad: requireSession,
  loader: () => getInventoryDashboard(),
  head: () => ({ meta: [{ title: "Report — NACOS Hardware Unit" }] }),
  component: ReportsPage,
});

type Group = Counts & { name: string; items: number };

function groupBy(items: InventoryItem[], key: (i: InventoryItem) => string): Group[] {
  const map = new Map<string, InventoryItem[]>();
  for (const i of items) {
    const k = key(i) || "Not set";
    map.set(k, [...(map.get(k) ?? []), i]);
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, items: list.length, ...sumCounts(list) }))
    .sort((a, b) => b.quantity_total - a.quantity_total || a.name.localeCompare(b.name));
}

function ReportsPage() {
  const data = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const items = data.items;
  const totals = useMemo(() => sumCounts(items), [items]);
  const byCategory = useMemo(() => groupBy(items, (i) => i.category_name), [items]);
  const byLocation = useMemo(() => groupBy(items, (i) => i.location), [items]);
  const attention = useMemo(
    () =>
      items
        .filter((i) => i.quantity_faulty || i.quantity_maintenance || i.quantity_missing)
        .sort(
          (a, b) =>
            b.quantity_faulty + b.quantity_missing - (a.quantity_faulty + a.quantity_missing),
        ),
    [items],
  );

  return (
    <AppShell
      me={me}
      title="Inventory report"
      subtitle={`As of ${formatDay(new Date().toISOString())}`}
      action={
        <>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print or save as PDF
          </Button>
          <Button
            onClick={() =>
              exportItems(
                [...items].sort((a, b) => a.name.localeCompare(b.name)),
                "nacos-inventory-full",
              )
            }
          >
            <Download />
            Export to CSV
          </Button>
        </>
      }
    >
      <Panel className="p-5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-4xl font-black">{fmt(totals.quantity_total)}</span>
          <span className="text-sm text-muted-foreground">units across {items.length} items</span>
        </div>
        <ConditionBar counts={totals} className="mt-4 h-4" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CONDITIONS.map((c) => (
            <div key={c.key}>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Swatch tone={c.tone} />
                {c.label}
              </p>
              <p className={`text-2xl font-black ${toneText[c.tone]}`}>
                {fmt(totals[c.col])}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {pct(totals[c.col], totals.quantity_total)}%
                </span>
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-bold">Needs attention</h2>
          <span className="text-sm text-muted-foreground">
            {attention.length} {attention.length === 1 ? "item has" : "items have"} faulty,
            under-maintenance or missing units
          </span>
        </div>
        {attention.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-4 py-2 font-semibold">Location</th>
                  <th className="px-4 py-2 text-right font-semibold">Faulty</th>
                  <th className="px-4 py-2 text-right font-semibold">Maint.</th>
                  <th className="px-4 py-2 text-right font-semibold">Missing</th>
                  <th className="px-4 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attention.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5 font-semibold">{i.name}</td>
                    <td className="px-4 py-2.5">{i.location}</td>
                    <td className="px-4 py-2.5 text-right text-fault">{fmt(i.quantity_faulty)}</td>
                    <td className="px-4 py-2.5 text-right text-warn">
                      {fmt(i.quantity_maintenance)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-missing">
                      {fmt(i.quantity_missing)}
                    </td>
                    <td className="min-w-48 px-4 py-2.5 text-muted-foreground">{i.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Everything is working">
            No faulty, under-maintenance or missing units on record.
          </EmptyState>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Breakdown title="By category" first="Category" rows={byCategory} />
        <Breakdown title="By location" first="Location" rows={byLocation} />
      </div>
    </AppShell>
  );
}

function Breakdown({ title, first, rows }: { title: string; first: string; rows: Group[] }) {
  return (
    <Panel>
      <h2 className="border-b border-border px-4 py-3 font-bold">{title}</h2>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">{first}</th>
                <th className="px-3 py-2 text-right font-semibold">Units</th>
                <th className="px-3 py-2 text-right font-semibold">Working</th>
                <th className="px-3 py-2 text-right font-semibold">Faulty</th>
                <th className="px-3 py-2 text-right font-semibold">Maint.</th>
                <th className="w-1/4 px-4 py-2">
                  <span className="sr-only">Condition</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="px-4 py-2.5 font-semibold">{r.name}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{fmt(r.quantity_total)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(r.quantity_working)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(r.quantity_faulty)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(r.quantity_maintenance)}</td>
                  <td className="px-4 py-2.5">
                    <ConditionBar counts={r} className="h-2 min-w-16" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Nothing recorded yet" />
      )}
    </Panel>
  );
}
