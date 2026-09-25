import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, LogOut, Moon, MoreHorizontal, Plus, Search, Sun, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { deleteInventoryItem, getInventoryDashboard, saveInventoryItem, signOutAdmin } from "@/lib/inventory.functions";
import type { Enums, Tables } from "@/integrations/supabase/types";

type Item = Tables<"inventory_items"> & { categories: { name: string } | null };
type Condition = Enums<"item_condition">;

export const Route = createFileRoute("/")({
  loader: () => getInventoryDashboard(),
  head: () => ({ meta: [
    { title: "Inventory Dashboard — NACOS Hardware Unit" },
    { name: "description", content: "Secure hardware inventory, condition tracking, and audit history for the NACOS Hardware Unit." },
    { property: "og:title", content: "Inventory Dashboard — NACOS Hardware Unit" },
    { property: "og:description", content: "Hardware inventory and condition records for the NACOS Hardware Unit." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: InventoryDashboard,
});

const conditionLabel: Record<Condition, string> = { working: "Working", faulty: "Faulty", under_maintenance: "Maintenance", missing: "Missing", retired: "Retired" };
const conditionClass: Record<Condition, string> = { working: "text-good bg-good/10", faulty: "text-fault bg-fault/10", under_maintenance: "text-warn bg-warn/10", missing: "text-fault bg-fault/10", retired: "text-quiet bg-muted" };
const emptyForm = { name: "", category_id: "", quantity_total: 0, quantity_working: 0, quantity_faulty: 0, quantity_maintenance: 0, quantity_missing: 0, quantity_retired: 0, condition: "working" as Condition, location: "", notes: "", date_added: new Date().toISOString().slice(0, 10) };

function InventoryDashboard() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const saveItem = useServerFn(saveInventoryItem);
  const removeItem = useServerFn(deleteInventoryItem);
  const signOut = useServerFn(signOutAdmin);
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [condition, setCondition] = useState("all");
  const [location, setLocation] = useState("all");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { const value = localStorage.getItem("nacos-theme") === "dark"; setDark(value); document.documentElement.classList.toggle("dark", value); }, []);
  const toggleTheme = () => { const next = !dark; setDark(next); localStorage.setItem("nacos-theme", next ? "dark" : "light"); document.documentElement.classList.toggle("dark", next); };
  const items = data.items as Item[];
  const totals = useMemo(() => items.reduce((acc, item) => ({ total: acc.total + item.quantity_total, working: acc.working + item.quantity_working, faulty: acc.faulty + item.quantity_faulty + item.quantity_missing, maintenance: acc.maintenance + item.quantity_maintenance }), { total: 0, working: 0, faulty: 0, maintenance: 0 }), [items]);
  const locations = [...new Set(items.map((item) => item.location))].sort();
  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) && (category === "all" || item.category_id === category) && (condition === "all" || item.condition === condition) && (location === "all" || item.location === location));

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const number = (name: string) => Number(form.get(name) ?? 0);
    const payload = { id: editing !== "new" && editing ? editing.id : undefined, name: String(form.get("name")), category_id: String(form.get("category_id")), quantity_total: number("quantity_total"), quantity_working: number("quantity_working"), quantity_faulty: number("quantity_faulty"), quantity_maintenance: number("quantity_maintenance"), quantity_missing: number("quantity_missing"), quantity_retired: number("quantity_retired"), condition: String(form.get("condition")) as Condition, location: String(form.get("location")), notes: String(form.get("notes")), date_added: String(form.get("date_added")) };
    try { await saveItem({ data: payload }); setEditing(null); await router.invalidate(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Item could not be saved."); } finally { setBusy(false); }
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete ${item.name}? This cannot be undone.`)) return;
    await removeItem({ data: { id: item.id, name: item.name } });
    setMenu(null); await router.invalidate();
  }

  async function logout() { await signOut(); await router.navigate({ to: "/login", replace: true }); }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="brand-panel relative h-56 overflow-hidden text-brand-foreground">
      <div className="pattern-grid absolute inset-0" />
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-brand-foreground/25 bg-brand-foreground/10 text-lg font-black">N</span><div className="min-w-0 leading-none"><p className="text-xl font-black">NACOS</p><p className="mt-1 truncate text-[10px] uppercase text-brand-foreground/70 sm:text-xs">Hardware Inventory</p></div></div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button aria-label="Toggle theme" title="Toggle theme" variant="header" size="icon" onClick={toggleTheme}>{dark ? <Sun /> : <Moon />}</Button>
          <Button aria-label="Sign out" title="Sign out" variant="header" size="icon" onClick={logout}><LogOut /></Button>
          <div className="hidden items-center gap-2 rounded-lg border border-brand-foreground/20 bg-brand-foreground/10 px-2 py-1.5 md:flex"><span className="grid size-6 place-items-center rounded-full bg-brand-foreground/20 text-[10px] font-bold">AD</span><span className="text-xs font-semibold">Hardware Admin</span></div>
        </div>
      </div>
      <div className="relative mx-auto mt-7 grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-4 sm:px-6">
        <div className="min-w-0"><h1 className="text-4xl font-black leading-none sm:text-6xl">Inventory</h1><p className="mt-2 truncate text-xs text-brand-foreground/70 sm:text-sm">{totals.total} assets under active inspection</p></div>
        <Button variant="brand" onClick={() => setEditing("new")}><Plus /> <span className="hidden sm:inline">Add item</span></Button>
      </div>
    </header>

    <section className="relative mx-auto -mt-10 max-w-6xl px-4 sm:px-6">
      <div className="stats-shell overflow-hidden rounded-2xl border border-border bg-card/85 shadow-sm backdrop-blur">
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <Metric label="Total assets" value={totals.total} />
          <Metric label="Working" value={totals.working} tone="text-good" />
          <Metric label="Maintenance" value={totals.maintenance} tone="text-warn" />
          <Metric label="Faulty / missing" value={totals.faulty} tone="text-fault" />
        </div>
      </div>
    </section>

    <div className="mx-auto grid max-w-6xl items-start gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto]">
          <label className="relative col-span-2 sm:col-span-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search equipment…" className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          <Select value={category} onChange={setCategory} label="Category" options={data.categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Select value={condition} onChange={setCondition} label="Condition" options={Object.entries(conditionLabel).map(([value, label]) => ({ value, label }))} />
          <Select value={location} onChange={setLocation} label="Location" options={locations.map((value) => ({ value, label: value }))} />
        </div>
        <div className="hidden overflow-visible rounded-xl border border-border bg-card md:block">
          <div className="grid table-grid gap-3 border-b border-border bg-muted/60 px-4 py-2.5 text-[10px] font-bold uppercase text-muted-foreground"><span>Item</span><span>Category</span><span className="text-right">Total</span><span className="text-right">Working</span><span className="text-right">Faulty</span><span className="text-right">Maint.</span><span>Location</span><span /></div>
          {filtered.map((item) => <InventoryRow key={item.id} item={item} menu={menu} setMenu={setMenu} view={() => setViewing(item)} edit={() => setEditing(item)} remove={() => deleteItem(item)} />)}
          {!filtered.length && <Empty />}
        </div>
        <div className="grid gap-3 md:hidden">
          {filtered.map((item) => <article key={item.id} className="rounded-xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">{item.categories?.name} · {item.location}</p></div><Button variant="ghost" size="icon" onClick={() => setEditing(item)}><MoreHorizontal /></Button></div><div className="mt-4 grid grid-cols-4 gap-2 text-center"><Mini label="Total" value={item.quantity_total} /><Mini label="Working" value={item.quantity_working} /><Mini label="Faulty" value={item.quantity_faulty} /><Mini label="Maint." value={item.quantity_maintenance} /></div><Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setViewing(item)}>View details</Button></article>)}
          {!filtered.length && <Empty />}
        </div>
      </section>
      <aside className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase text-muted-foreground">Recent activity</h2><span className="size-2 rounded-full bg-good" /></div>
        <div className="space-y-4">{data.audits.length ? data.audits.map((audit) => <div key={audit.id} className="flex gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${audit.action === "deleted" ? "bg-fault" : audit.action === "created" ? "bg-good" : "bg-warn"}`} /><div><p className="text-sm font-semibold">{audit.item_name}</p><p className="text-xs capitalize text-muted-foreground">{audit.action} · {formatDate(audit.created_at)}</p></div></div>) : <p className="text-sm text-muted-foreground">Changes will appear here.</p>}</div>
      </aside>
    </div>
    {editing && <ItemModal item={editing === "new" ? null : editing} categories={data.categories} close={() => { setEditing(null); setError(""); }} submit={submitItem} error={error} busy={busy} />}
    {viewing && <ViewModal item={viewing} close={() => setViewing(null)} edit={() => { setEditing(viewing); setViewing(null); }} />}
  </main>;
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) { return <div className="px-4 py-4 sm:px-5"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-black tabular-nums ${tone}`}>{value}</p></div>; }
function Mini({ label, value }: { label: string; value: number }) { return <div><p className="text-lg font-black">{value}</p><p className="text-[9px] uppercase text-muted-foreground">{label}</p></div>; }
function Empty() { return <div className="p-10 text-center text-sm text-muted-foreground">No equipment matches these filters.</div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

function Select({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: { value: string; label: string }[] }) { return <label className="relative"><select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full appearance-none rounded-lg border border-border bg-card pl-3 pr-8 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"><option value="all">All {label.toLowerCase()}s</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" /></label>; }

function InventoryRow({ item, menu, setMenu, view, edit, remove }: { item: Item; menu: string | null; setMenu: (id: string | null) => void; view: () => void; edit: () => void; remove: () => void }) { return <div className="table-grid relative grid items-center gap-3 border-b border-border px-4 py-3 text-xs last:border-0 hover:bg-muted/40"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.name}</p><p className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${conditionClass[item.condition]}`}>{conditionLabel[item.condition]}</p></div><span className="truncate">{item.categories?.name}</span><span className="text-right font-mono font-semibold">{item.quantity_total}</span><span className="text-right font-mono text-good">{item.quantity_working}</span><span className="text-right font-mono text-fault">{item.quantity_faulty}</span><span className="text-right font-mono text-warn">{item.quantity_maintenance}</span><span className="truncate">{item.location}</span><Button variant="ghost" size="icon" onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal /></Button>{menu === item.id && <div className="absolute right-3 top-11 z-20 w-32 rounded-lg border border-border bg-popover p-1 shadow-lg"><button onClick={view} className="w-full rounded px-3 py-2 text-left hover:bg-accent">View</button><button onClick={edit} className="w-full rounded px-3 py-2 text-left hover:bg-accent">Edit</button><button onClick={remove} className="w-full rounded px-3 py-2 text-left text-destructive hover:bg-destructive/10">Delete</button></div>}</div>; }

function ItemModal({ item, categories, close, submit, error, busy }: { item: Item | null; categories: Tables<"categories">[]; close: () => void; submit: (e: FormEvent<HTMLFormElement>) => void; error: string; busy: boolean }) {
  const values = item ?? emptyForm;
  return <div className="fixed inset-0 z-50 grid place-items-end bg-overlay/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-2xl font-black">{item ? "Edit equipment" : "Add equipment"}</h2><p className="mt-1 text-sm text-muted-foreground">Keep every condition count aligned with the total.</p></div><Button type="button" variant="ghost" size="icon" onClick={close}><X /></Button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Equipment name" name="name" defaultValue={values.name} /><label className="text-xs font-bold uppercase text-muted-foreground">Category<select name="category_id" required defaultValue={values.category_id || categories[0]?.id} className="form-control">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Field label="Location" name="location" defaultValue={values.location} /><Field label="Date added" name="date_added" type="date" defaultValue={values.date_added} /><Field label="Total available" name="quantity_total" type="number" defaultValue={values.quantity_total} /><Field label="Working" name="quantity_working" type="number" defaultValue={values.quantity_working} /><Field label="Faulty" name="quantity_faulty" type="number" defaultValue={values.quantity_faulty} /><Field label="Under maintenance" name="quantity_maintenance" type="number" defaultValue={values.quantity_maintenance} /><Field label="Missing" name="quantity_missing" type="number" defaultValue={values.quantity_missing} /><Field label="Retired" name="quantity_retired" type="number" defaultValue={values.quantity_retired} /><label className="text-xs font-bold uppercase text-muted-foreground sm:col-span-2">Overall condition<select name="condition" defaultValue={values.condition} className="form-control">{Object.entries(conditionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-bold uppercase text-muted-foreground sm:col-span-2">Notes<textarea name="notes" defaultValue={values.notes} rows={3} className="form-control h-auto py-3" /></label></div>{error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button disabled={busy}><Check />{busy ? "Saving…" : "Save item"}</Button></div></form></div>;
}
function Field({ label, name, type = "text", defaultValue }: { label: string; name: string; type?: string; defaultValue: string | number }) { return <label className="text-xs font-bold uppercase text-muted-foreground">{label}<input name={name} type={type} min={type === "number" ? 0 : undefined} required defaultValue={defaultValue} className="form-control" /></label>; }
function ViewModal({ item, close, edit }: { item: Item; close: () => void; edit: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-end bg-overlay/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className="w-full max-w-lg rounded-t-2xl border border-border bg-card p-6 shadow-2xl sm:rounded-2xl"><div className="flex items-start justify-between"><div><span className={`inline-flex rounded px-2 py-1 text-[10px] font-bold ${conditionClass[item.condition]}`}>{conditionLabel[item.condition]}</span><h2 className="mt-3 text-2xl font-black">{item.name}</h2><p className="mt-1 text-sm text-muted-foreground">{item.categories?.name} · {item.location}</p></div><Button variant="ghost" size="icon" onClick={close}><X /></Button></div><div className="mt-6 grid grid-cols-3 gap-3"><Mini label="Total" value={item.quantity_total} /><Mini label="Working" value={item.quantity_working} /><Mini label="Faulty" value={item.quantity_faulty} /><Mini label="Maintenance" value={item.quantity_maintenance} /><Mini label="Missing" value={item.quantity_missing} /><Mini label="Retired" value={item.quantity_retired} /></div>{item.notes && <p className="mt-6 rounded-lg bg-muted p-3 text-sm leading-6">{item.notes}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={close}>Close</Button><Button onClick={edit}>Edit item</Button></div></section></div>; }
