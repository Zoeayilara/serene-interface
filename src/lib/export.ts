import { CONDITIONS, downloadCSV, todayISO } from "@/lib/format";
import type { InventoryItem } from "@/lib/inventory.functions";

export function exportItems(items: InventoryItem[], base: string) {
  const head = [
    "Item",
    "Category",
    "Total",
    ...CONDITIONS.map((c) => c.label),
    "Location",
    "Notes",
    "Date added",
    "Last updated",
    "Last updated by",
  ];
  const rows = items.map((i) => [
    i.name,
    i.category_name,
    i.quantity_total,
    ...CONDITIONS.map((c) => i[c.col]),
    i.location,
    i.notes,
    i.date_added,
    new Date(i.updated_at).toLocaleString("en-GB"),
    i.updated_by_name ?? "",
  ]);
  downloadCSV(`${base}-${todayISO()}.csv`, [head, ...rows]);
}
