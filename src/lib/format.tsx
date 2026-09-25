import type { Json } from "@/integrations/supabase/types";

export const CONDITIONS = [
  { key: "working", col: "quantity_working", label: "Working", short: "Working", tone: "good" },
  { key: "faulty", col: "quantity_faulty", label: "Faulty", short: "Faulty", tone: "fault" },
  {
    key: "under_maintenance",
    col: "quantity_maintenance",
    label: "Under maintenance",
    short: "Maint.",
    tone: "warn",
  },
  { key: "missing", col: "quantity_missing", label: "Missing", short: "Missing", tone: "missing" },
  { key: "retired", col: "quantity_retired", label: "Retired", short: "Retired", tone: "quiet" },
] as const;

export type ConditionKey = (typeof CONDITIONS)[number]["key"];
export type CountCol = (typeof CONDITIONS)[number]["col"];
export type Counts = Record<CountCol, number> & { quantity_total: number };

export const toneBg: Record<string, string> = {
  good: "bg-good",
  fault: "bg-fault",
  warn: "bg-warn",
  missing: "bg-missing",
  quiet: "bg-quiet",
};
export const toneText: Record<string, string> = {
  good: "text-good",
  fault: "text-fault",
  warn: "text-warn",
  missing: "text-missing",
  quiet: "text-muted-foreground",
};

export const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  category: "Category",
  location: "Location",
  date_added: "Date added",
  notes: "Notes",
  quantity_total: "Total",
  quantity_working: "Working",
  quantity_faulty: "Faulty",
  quantity_maintenance: "Maintenance",
  quantity_missing: "Missing",
  quantity_retired: "Retired",
};

export const ROLE_LABELS: Record<string, string> = {
  hardware_director: "Hardware Director",
  assistant_hardware_director: "Assistant Hardware Director",
};

export function sumCounts<T extends Counts>(items: T[]): Counts {
  const t: Counts = {
    quantity_total: 0,
    quantity_working: 0,
    quantity_faulty: 0,
    quantity_maintenance: 0,
    quantity_missing: 0,
    quantity_retired: 0,
  };
  for (const i of items) {
    t.quantity_total += i.quantity_total;
    for (const c of CONDITIONS) t[c.col] += i[c.col];
  }
  return t;
}

export const fmt = (n: number) => n.toLocaleString("en-NG");
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dayFmt.format(d);
}
export function formatShort(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : shortFmt.format(d);
}
export function formatWhen(value: string) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? "Today" : same(d, yesterday) ? "Yesterday" : dayFmt.format(d);
  return `${day}, ${timeFmt.format(d)}`;
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatValue(key: string, v: Json | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "date_added" && typeof v === "string") return formatDay(v);
  if (key === "notes") {
    const s = String(v);
    return s.length > 60 ? `${s.slice(0, 57)}…` : s;
  }
  return typeof v === "number" ? fmt(v) : String(v);
}

export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ConditionBar({
  counts,
  className = "h-2",
}: {
  counts: Counts;
  className?: string;
}) {
  const total = counts.quantity_total;
  const label = CONDITIONS.map((c) => `${counts[c.col]} ${c.label.toLowerCase()}`).join(", ");
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex overflow-hidden rounded-sm bg-muted ${className}`}
    >
      {total > 0 &&
        CONDITIONS.filter((c) => counts[c.col] > 0).map((c) => (
          <span
            key={c.key}
            title={`${c.label}: ${counts[c.col]}`}
            className={toneBg[c.tone]}
            style={{ width: `${(counts[c.col] / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

export function Swatch({ tone }: { tone: string }) {
  return (
    <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-[2px] ${toneBg[tone]}`} />
  );
}
