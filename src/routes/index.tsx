import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell, ConfirmModal, EmptyState, Panel } from "@/components/app-shell";
import { ItemForm, ItemView } from "@/components/item-dialogs";
import { Button } from "@/components/ui/button";
import {
  CONDITIONS,
  ConditionBar,
  fmt,
  formatShort,
  formatWhen,
  pct,
  sumCounts,
  Swatch,
  toneText,
  type ConditionKey,
} from "@/lib/format";
import { exportItems } from "@/lib/export";
import { requireSession } from "@/lib/guard";
import {
  deleteInventoryItem,
  getInventoryDashboard,
  type InventoryItem,
} from "@/lib/inventory.functions";

type SortKey =
  | "name"
  | "category_name"
  | "quantity_total"
  | "quantity_working"
  | "quantity_faulty"
  | "quantity_maintenance"
  | "location"
  | "updated_at";

export const Route = createFileRoute("/")({
  beforeLoad: requireSession,
  loader: () => getInventoryDashboard(),
  head: () => ({ meta: [{ title: "Inventory — NACOS Hardware Unit" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const data = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const router = useRouter();
  const removeItem = useServerFn(deleteInventoryItem);
  const items = data.items;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [condition, setCondition] = useState<"all" | ConditionKey>("all");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  const [viewing, setViewing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => sumCounts(items), [items]);
  const locations = useMemo(
    () =>
      [...new Set(items.map((i) => i.location).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const filtering =
    query.trim() !== "" || category !== "all" || condition !== "all" || location !== "all";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const col = condition === "all" ? null : CONDITIONS.find((c) => c.key === condition)!.col;
    const rows = items.filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q)) &&
        (category === "all" || i.category_id === category) &&
        (!col || i[col] > 0) &&
        (location === "all" || i.location === location),
    );
    const val = (i: InventoryItem) =>
      typeof i[sort.key] === "number" ? (i[sort.key] as number) : String(i[sort.key]).toLowerCase();
    return rows.sort((a, b) => (val(a) > val(b) ? sort.dir : val(a) < val(b) ? -sort.dir : 0));
  }, [items, query, category, condition, location, sort]);

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setCondition("all");
    setLocation("all");
  }
  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: ["name", "category_name", "location"].includes(key) ? 1 : -1 },
    );
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await removeItem({ data: { id: deleting.id } });
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
      setViewing(null);
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The item could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  const actions = (item: InventoryItem) => ({
    view: () => setViewing(item),
    edit: () => setEditing(item),
    remove: () => setDeleting(item),
  });

  return (
    <AppShell
      me={me}
      title="Inventory"
      subtitle={`${fmt(totals.quantity_total)} units across ${items.length} ${items.length === 1 ? "item" : "items"}`}
      action={
        <Button variant="brand" onClick={() => setEditing("new")}>
          <Plus /> Add item
        </Button>
      }
    >
      <Panel className="stats-shell p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-black leading-none">{fmt(totals.quantity_total)}</span>
          <span className="text-sm text-muted-foreground">units on record</span>
        </div>
        <ConditionBar counts={totals} className="mt-4 h-4" />
        <div className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-5">
          {CONDITIONS.map((c) => {
            const active = condition === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => setCondition(active ? "all" : c.key)}
                title={active ? "Show all items" : `Show items with ${c.label.toLowerCase()} units`}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-foreground/40 bg-muted" : "border-transparent hover:bg-muted/60"} ${c.key === "working" ? "col-span-2 sm:col-span-1" : ""}`}
              >
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Swatch tone={c.tone} />
                  {c.label}
                </span>
                <span className="mt-0.5 flex items-baseline gap-2">
                  <span className={`text-2xl font-black ${toneText[c.tone]}`}>
                    {fmt(totals[c.col])}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {pct(totals[c.col], totals.quantity_total)}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="mt-6 grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto]">
            <label className="relative col-span-2 sm:col-span-1">
              <span className="sr-only">Search</span>
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or notes"
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
            </label>
            <FilterSelect
              value={category}
              onChange={setCategory}
              label="Category"
              all="All categories"
              options={data.categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              value={condition}
              onChange={(v) => setCondition(v as typeof condition)}
              label="Condition"
              all="Any condition"
              options={CONDITIONS.map((c) => ({
                value: c.key,
                label: `Has ${c.label.toLowerCase()}`,
              }))}
            />
            <FilterSelect
              value={location}
              onChange={setLocation}
              label="Location"
              all="All locations"
              options={locations.map((l) => ({ value: l, label: l }))}
              className="col-span-2 sm:col-span-1"
            />
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {filtering
                ? `Showing ${filtered.length} of ${items.length}`
                : `${items.length} ${items.length === 1 ? "item" : "items"}`}
              {filtering && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-3 inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  <X className="size-3.5" />
                  Clear filters
                </button>
              )}
            </span>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={() => exportItems(filtered, "nacos-inventory")}
                className="inline-flex items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline"
              >
                <Download className="size-4" />
                Export {filtering ? "these" : "all"} to CSV
              </button>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden rounded-xl border border-border bg-card md:block">
            <div className="table-grid grid gap-3 rounded-t-xl border-b border-border bg-muted/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
              <SortHead k="name" sort={sort} onSort={toggleSort}>
                Item
              </SortHead>
              <SortHead k="category_name" sort={sort} onSort={toggleSort}>
                Category
              </SortHead>
              <SortHead k="quantity_total" sort={sort} onSort={toggleSort} right>
                Total
              </SortHead>
              <SortHead k="quantity_working" sort={sort} onSort={toggleSort} right>
                Working
              </SortHead>
              <SortHead k="quantity_faulty" sort={sort} onSort={toggleSort} right>
                Faulty
              </SortHead>
              <SortHead k="quantity_maintenance" sort={sort} onSort={toggleSort} right>
                Maint.
              </SortHead>
              <SortHead k="location" sort={sort} onSort={toggleSort}>
                Location
              </SortHead>
              <span />
            </div>
            {filtered.map((item) => (
              <InventoryRow key={item.id} item={item} {...actions(item)} />
            ))}
            {!filtered.length && (
              <NoRows empty={!items.length} clear={clearFilters} add={() => setEditing("new")} />
            )}
          </div>

          {/* Phone cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((item) => (
              <article key={item.id} className="rounded-xl border border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => setViewing(item)}
                  className="block w-full text-left"
                >
                  <h2 className="font-bold">{item.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.category_name} in {item.location}
                  </p>
                  <ConditionBar counts={item} className="mt-3 h-2" />
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <Mini label="Total" value={item.quantity_total} />
                    <Mini label="Working" value={item.quantity_working} tone="text-good" />
                    <Mini label="Faulty" value={item.quantity_faulty} tone="text-fault" />
                    <Mini label="Maint." value={item.quantity_maintenance} tone="text-warn" />
                  </div>
                </button>
                <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViewing(item)}>
                    <Eye />
                    View
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
                    <Pencil />
                    Update
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Delete ${item.name}`}
                    className="text-destructive"
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </article>
            ))}
            {!filtered.length && (
              <div className="rounded-xl border border-border bg-card">
                <NoRows empty={!items.length} clear={clearFilters} add={() => setEditing("new")} />
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-bold">Recent changes</h2>
          <div className="space-y-4">
            {data.audits.length ? (
              data.audits.map((a) => (
                <div key={a.id} className="flex gap-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${a.action === "deleted" ? "bg-fault" : a.action === "created" ? "bg-good" : "bg-warn"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold">{a.actor_name}</span>{" "}
                      {a.action === "created" ? "added" : a.action}{" "}
                      <span className="font-semibold">{a.item_name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatWhen(a.created_at)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Every add, update and delete will show up here.
              </p>
            )}
          </div>
          {data.audits.length > 0 && (
            <Link
              to="/history"
              className="mt-5 inline-block text-sm font-semibold underline-offset-4 hover:underline"
            >
              See full history
            </Link>
          )}
        </aside>
      </div>

      {editing && (
        <ItemForm
          item={editing === "new" ? null : editing}
          categories={data.categories}
          locations={locations}
          existing={items}
          close={() => setEditing(null)}
          saved={async (name, isNew) => {
            setEditing(null);
            toast.success(isNew ? `Added ${name}` : `Saved ${name}`);
            await router.invalidate();
          }}
        />
      )}
      {viewing && !editing && (
        <ItemView
          item={viewing}
          close={() => setViewing(null)}
          edit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          remove={() => setDeleting(viewing)}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.name}?`}
          body={
            <>
              This removes all {fmt(deleting.quantity_total)} units in {deleting.location} from the
              inventory. The deletion stays in the history.
            </>
          }
          busy={busy}
          onConfirm={confirmDelete}
          close={() => setDeleting(null)}
        />
      )}
    </AppShell>
  );
}

function SortHead({
  k,
  sort,
  onSort,
  right,
  children,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  right?: boolean;
  children: string;
}) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      className={`inline-flex items-center gap-1 hover:text-foreground ${right ? "justify-end" : ""} ${active ? "text-foreground" : ""}`}
    >
      {children}
      {active &&
        (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  all,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  all: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="all">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Mini({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={`text-lg font-black ${value ? tone : "text-muted-foreground/60"}`}>
        {fmt(value)}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Num({ value, tone }: { value: number; tone?: string }) {
  return (
    <span className={`text-right ${value ? (tone ?? "") : "text-muted-foreground/50"}`}>
      {fmt(value)}
    </span>
  );
}

function NoRows({ empty, clear, add }: { empty: boolean; clear: () => void; add: () => void }) {
  return empty ? (
    <EmptyState title="No equipment recorded yet">
      Start with whatever is in the lab in front of you.
      <div className="mt-4">
        <Button onClick={add}>
          <Plus />
          Add the first item
        </Button>
      </div>
    </EmptyState>
  ) : (
    <EmptyState title="Nothing matches these filters">
      <button
        type="button"
        onClick={clear}
        className="font-semibold text-foreground underline underline-offset-4"
      >
        Clear the filters
      </button>{" "}
      to see everything.
    </EmptyState>
  );
}

function InventoryRow({
  item,
  view,
  edit,
  remove,
}: {
  item: InventoryItem;
  view: () => void;
  edit: () => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="table-grid relative grid items-center gap-3 border-b border-border px-4 py-3 text-sm last:rounded-b-xl last:border-0 hover:bg-muted/40">
      <div className="min-w-0">
        <button
          type="button"
          onClick={view}
          className="block max-w-full truncate text-left font-bold hover:underline"
        >
          {item.name}
        </button>
        <ConditionBar counts={item} className="mt-1.5 h-1.5 max-w-48" />
      </div>
      <span className="truncate text-muted-foreground">{item.category_name}</span>
      <span className="text-right font-bold">{fmt(item.quantity_total)}</span>
      <Num value={item.quantity_working} />
      <Num value={item.quantity_faulty} tone="font-semibold text-fault" />
      <Num value={item.quantity_maintenance} tone="font-semibold text-warn" />
      <span className="min-w-0">
        <span className="block truncate">{item.location}</span>
        <span
          className="block truncate text-xs text-muted-foreground"
          title={item.updated_by_name ? `Last updated by ${item.updated_by_name}` : undefined}
        >
          {formatShort(item.updated_at)}
        </span>
      </span>
      <div ref={ref} className="relative">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${item.name}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <MoreHorizontal />
        </Button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-10 z-20 w-36 rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={pick(view)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-accent"
            >
              <Eye className="size-4" />
              View
            </button>
            <button
              role="menuitem"
              onClick={pick(edit)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-accent"
            >
              <Pencil className="size-4" />
              Update
            </button>
            <button
              role="menuitem"
              onClick={pick(remove)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
