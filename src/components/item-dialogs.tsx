import { useServerFn } from "@tanstack/react-start";
import { Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, Modal } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import type { Json } from "@/integrations/supabase/types";
import {
  CONDITIONS,
  ConditionBar,
  FIELD_LABELS,
  fmt,
  formatDay,
  formatValue,
  formatWhen,
  Swatch,
  todayISO,
  type ConditionKey,
  type Counts,
  type CountCol,
} from "@/lib/format";
import {
  getHistory,
  saveInventoryItem,
  type AuditEntry,
  type Category,
  type FieldChange,
  type InventoryItem,
} from "@/lib/inventory.functions";

const inputClass =
  "mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring sm:text-sm";
const labelClass = "block text-sm font-semibold";

// ── Add / update form ────────────────────────────────────────────────────────
export function ItemForm({
  item,
  categories,
  locations,
  existing,
  close,
  saved,
}: {
  item: InventoryItem | null;
  categories: Category[];
  locations: string[];
  existing: InventoryItem[];
  close: () => void;
  saved: (name: string, isNew: boolean) => void | Promise<void>;
}) {
  const save = useServerFn(saveInventoryItem);
  const isNew = !item;
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [dateAdded, setDateAdded] = useState(item?.date_added ?? todayISO());
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [total, setTotal] = useState(String(item?.quantity_total ?? ""));
  const [counts, setCounts] = useState<Record<ConditionKey, string>>(
    () =>
      Object.fromEntries(CONDITIONS.map((c) => [c.key, String(item?.[c.col] ?? 0)])) as Record<
        ConditionKey,
        string
      >,
  );
  // Working fills itself in with whatever isn't in another condition, until someone types in it directly.
  const [workingAuto, setWorkingAuto] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDupe, setConfirmDupe] = useState(false);

  const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
  const totalN = int(total);
  const others = (["faulty", "under_maintenance", "missing", "retired"] as const).reduce(
    (s, k) => s + (int(counts[k]) || 0),
    0,
  );

  useEffect(() => {
    if (workingAuto && !Number.isNaN(totalN))
      setCounts((c) => ({ ...c, working: String(Math.max(0, totalN - others)) }));
  }, [workingAuto, totalN, others]);

  const values = CONDITIONS.map((c) => int(counts[c.key]));
  const invalid = values.some(Number.isNaN) || Number.isNaN(totalN);
  const sum = values.reduce((a, b) => a + (b || 0), 0);
  const balanced = !invalid && sum === totalN && totalN >= 0 && total.trim() !== "";
  const preview = useMemo(() => {
    const c = { quantity_total: Math.max(sum, totalN || 0) } as Counts;
    CONDITIONS.forEach((k, i) => (c[k.col as CountCol] = values[i] || 0));
    return c;
  }, [sum, totalN, values]);

  let status: string;
  if (invalid && total.trim() === "") status = "Enter the total quantity.";
  else if (invalid) status = "Counts must be whole numbers, 0 or more.";
  else if (sum === totalN) status = `All ${fmt(totalN)} units accounted for.`;
  else if (sum < totalN)
    status = `${fmt(totalN - sum)} of ${fmt(totalN)} units don't have a condition yet.`;
  else
    status = `The conditions add up to ${fmt(sum)}, which is ${fmt(sum - totalN)} more than the total of ${fmt(totalN)}.`;

  function setCount(key: ConditionKey, value: string) {
    if (key === "working") setWorkingAuto(false);
    setCounts((c) => ({ ...c, [key]: value }));
  }
  function step(key: ConditionKey, delta: number) {
    setCount(key, String(Math.max(0, (int(counts[key]) || 0) + delta)));
  }

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const dupe = existing.find(
    (x) =>
      x.id !== item?.id &&
      x.name.trim().toLowerCase() === name.trim().toLowerCase() &&
      x.location.trim().toLowerCase() === location.trim().toLowerCase(),
  );

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Give the equipment a name.");
    if (!categoryId) return setError("Choose a category. You can add one on the Categories page.");
    if (location.trim().length < 2) return setError("Enter where the equipment is kept.");
    if (!balanced)
      return setError(
        "The condition counts need to add up to the total quantity before you can save.",
      );
    if (dupe && !confirmDupe) {
      setConfirmDupe(true);
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          id: item?.id,
          name: name.trim(),
          category_id: categoryId,
          location: location.trim(),
          notes: notes.trim(),
          date_added: dateAdded || todayISO(),
          quantity_total: totalN,
          quantity_working: values[0],
          quantity_faulty: values[1],
          quantity_maintenance: values[2],
          quantity_missing: values[3],
          quantity_retired: values[4],
        },
      });
      await saved(name.trim(), isNew);
    } catch (err) {
      setError(err instanceof Error ? cleanError(err.message) : "The item could not be saved.");
      setBusy(false);
    }
  }

  return (
    <Modal label={isNew ? "Add equipment" : `Update ${item.name}`} close={close} wide>
      <form onSubmit={submit} noValidate>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">
              {isNew ? "Add equipment" : `Update ${item.name}`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isNew
                ? "Record a type of equipment and how many units are in each condition."
                : "Change the counts after an inspection, or correct any detail."}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={close}>
            <X />
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>
            Equipment name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Desktop Computer"
              autoFocus={isNew}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedCategory?.description && (
              <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
                {selectedCategory.description}
              </span>
            )}
          </label>
          <label className={labelClass}>
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              list="nacos-locations"
              maxLength={120}
              placeholder="e.g. Computer Laboratory"
              className={inputClass}
            />
            <datalist id="nacos-locations">
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <label className={labelClass}>
            Date added
            <input
              type="date"
              value={dateAdded}
              max={todayISO()}
              onChange={(e) => setDateAdded(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Total quantity
            <input
              value={total}
              onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className={`${inputClass} no-spin`}
            />
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">Condition of the units</legend>
          <div className="mt-2 grid gap-2">
            {CONDITIONS.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <label
                  htmlFor={`count-${c.key}`}
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <Swatch tone={c.tone} />
                  {c.label}
                </label>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label={`One less ${c.label.toLowerCase()}`}
                    onClick={() => step(c.key, -1)}
                    className="grid size-10 place-items-center rounded-l-lg border border-input bg-muted hover:bg-accent"
                  >
                    <Minus className="size-4" />
                  </button>
                  <input
                    id={`count-${c.key}`}
                    value={counts[c.key]}
                    inputMode="numeric"
                    onChange={(e) => setCount(c.key, e.target.value.replace(/[^\d]/g, ""))}
                    className="no-spin h-10 w-16 border-y border-input bg-background text-center text-base font-semibold outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    aria-label={`One more ${c.label.toLowerCase()}`}
                    onClick={() => step(c.key, 1)}
                    className="grid size-10 place-items-center rounded-r-lg border border-input bg-muted hover:bg-accent"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {workingAuto
              ? "Working fills itself in with whatever isn't faulty, under maintenance, missing or retired."
              : "You've set Working yourself."}
          </p>
          <div
            className={`mt-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${balanced ? "bg-good/10 text-good" : "bg-fault/10 text-fault"}`}
          >
            {status}
            {(sum > 0 || totalN > 0) && <ConditionBar counts={preview} className="mt-2 h-2" />}
          </div>
        </fieldset>

        <label className={`${labelClass} mt-6`}>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. 3 systems need RAM replacement"
            className={`${inputClass} h-auto py-2.5`}
          />
        </label>

        {confirmDupe && dupe && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm"
          >
            There's already a <strong>{dupe.name}</strong> in {dupe.location}. Save this as a
            separate entry anyway, or cancel and update the existing one.
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy}>
            <Check />
            {busy ? "Saving…" : confirmDupe ? "Save anyway" : isNew ? "Add item" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function cleanError(message: string) {
  // zod errors arrive as JSON; show the first message only
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed) && parsed[0]?.message) return String(parsed[0].message);
  } catch {
    /* plain message */
  }
  return message;
}

// ── Detail view ──────────────────────────────────────────────────────────────
export function ItemView({
  item,
  close,
  edit,
  remove,
}: {
  item: InventoryItem;
  close: () => void;
  edit: () => void;
  remove: () => void;
}) {
  const history = useServerFn(getHistory);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    history({ data: { itemId: item.id, offset: 0, limit: 20 } })
      .then((r) => live && setEntries(r.entries))
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [history, item.id]);

  return (
    <Modal label={item.name} close={close} wide>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black">{item.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.category_name} in {item.location}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
          <X />
        </Button>
      </div>
      <ConditionBar counts={item} className="mt-5 h-3" />
      <ul className="mt-3 divide-y divide-border text-sm">
        {CONDITIONS.map((c) => (
          <li key={c.key} className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2">
              <Swatch tone={c.tone} />
              {c.label}
            </span>
            <span className="font-semibold">{fmt(item[c.col])}</span>
          </li>
        ))}
        <li className="flex items-center justify-between py-2 font-black">
          <span>Total</span>
          <span>{fmt(item.quantity_total)}</span>
        </li>
      </ul>
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Date added</dt>
        <dd>{formatDay(item.date_added)}</dd>
        <dt className="text-muted-foreground">Last updated</dt>
        <dd>
          {formatWhen(item.updated_at)}
          {item.updated_by_name ? ` by ${item.updated_by_name}` : ""}
        </dd>
        {item.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{item.notes}</dd>
          </>
        )}
      </dl>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" className="text-destructive" onClick={remove}>
          <Trash2 />
          Delete
        </Button>
        <Button onClick={edit}>
          <Pencil />
          Update counts
        </Button>
      </div>

      <h3 className="mt-8 text-sm font-bold">History</h3>
      <div className="mt-2 rounded-lg border border-border">
        {entries === null ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <HistoryList entries={entries} showItem={false} />
        )}
      </div>
    </Modal>
  );
}

// ── History list (used on the History page and in the detail view) ─────────
const ORDER = [
  "quantity_total",
  "quantity_working",
  "quantity_faulty",
  "quantity_maintenance",
  "quantity_missing",
  "quantity_retired",
  "name",
  "category",
  "location",
  "date_added",
  "notes",
];

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Older entries (before named accounts) stored whole rows as { before, after }; turn those into field changes too.
function normalise(e: AuditEntry): Record<string, FieldChange> {
  if (!isRecord(e.changes)) return {};
  const c = e.changes;
  if ("before" in c || "after" in c) {
    const before = isRecord(c["before"] ?? null) ? (c["before"] as Record<string, Json>) : null;
    const after = isRecord(c["after"] ?? null) ? (c["after"] as Record<string, Json>) : null;
    const out: Record<string, FieldChange> = {};
    for (const k of ORDER) {
      if (k === "category") continue;
      const a = before?.[k];
      const b = after?.[k];
      if (before && after) {
        if (JSON.stringify(a) !== JSON.stringify(b) && b !== undefined) out[k] = { from: a, to: b };
      } else if (after && b !== undefined) out[k] = { to: b };
    }
    return out;
  }
  const out: Record<string, FieldChange> = {};
  for (const [k, v] of Object.entries(c)) if (isRecord(v)) out[k] = v as FieldChange;
  return out;
}

function Changes({ e }: { e: AuditEntry }) {
  const c = normalise(e);
  const keys = ORDER.filter((k) => k in c);
  if (e.action === "updated") {
    return (
      <>
        {keys.map((k) => (
          <span key={k}>
            {FIELD_LABELS[k]}: {formatValue(k, c[k]?.from)} →{" "}
            <b className="font-semibold text-foreground">{formatValue(k, c[k]?.to)}</b>
          </span>
        ))}
      </>
    );
  }
  const side = e.action === "created" ? "to" : "from";
  return (
    <>
      {keys
        .filter((k) => k.startsWith("quantity") || k === "category" || k === "location")
        .filter((k) => !(k.startsWith("quantity_") && k !== "quantity_total" && !c[k]?.[side]))
        .map((k) => (
          <span key={k}>
            {FIELD_LABELS[k]}:{" "}
            <b className="font-semibold text-foreground">{formatValue(k, c[k]?.[side])}</b>
          </span>
        ))}
    </>
  );
}

export function HistoryList({
  entries,
  showItem = true,
}: {
  entries: AuditEntry[];
  showItem?: boolean;
}) {
  if (!entries.length)
    return (
      <EmptyState title="No changes yet">Every add, update and delete is listed here.</EmptyState>
    );
  const verb = { created: "added", updated: "updated", deleted: "deleted" } as Record<
    string,
    string
  >;
  const tag = {
    created: "bg-good/15 text-good",
    updated: "bg-primary/10 text-foreground",
    deleted: "bg-fault/15 text-fault",
  } as Record<string, string>;
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[1fr_auto]">
          <p className="text-sm">
            <span
              className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${tag[e.action] ?? ""}`}
            >
              {(
                { created: "Added", updated: "Updated", deleted: "Deleted" } as Record<
                  string,
                  string
                >
              )[e.action] ?? e.action}
            </span>
            <span className="font-semibold">{e.actor_name}</span> {verb[e.action] ?? e.action}{" "}
            {showItem ? <span className="font-semibold">{e.item_name}</span> : "this item"}
          </p>
          <p className="text-xs text-muted-foreground sm:text-right">{formatWhen(e.created_at)}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground sm:col-span-2">
            <Changes e={e} />
          </p>
        </li>
      ))}
    </ul>
  );
}
