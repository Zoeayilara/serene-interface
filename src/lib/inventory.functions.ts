import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Enums, Json, Tables } from "@/integrations/supabase/types";

export type Condition = Enums<"item_condition">;
export type InventoryItem = Tables<"inventory_items"> & {
  category_name: string;
  updated_by_name: string | null;
};
export type AuditEntry = Tables<"audit_logs">;
export type Category = Tables<"categories"> & { item_count: number };
export type FieldChange = { from?: Json | undefined; to?: Json | undefined };

const TRACKED = [
  "name",
  "category",
  "location",
  "date_added",
  "notes",
  "quantity_total",
  "quantity_working",
  "quantity_faulty",
  "quantity_maintenance",
  "quantity_missing",
  "quantity_retired",
] as const;

// The single "condition" column is kept in sync with the counts so it can never contradict them:
// the most common problem state if there is one, otherwise working (or retired if nothing else is left).
function deriveCondition(v: {
  quantity_working: number;
  quantity_faulty: number;
  quantity_maintenance: number;
  quantity_missing: number;
  quantity_retired: number;
}): Condition {
  const problems: [Condition, number][] = [
    ["faulty", v.quantity_faulty],
    ["missing", v.quantity_missing],
    ["under_maintenance", v.quantity_maintenance],
  ];
  const worst = problems.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (worst[1] > 0) return worst[0];
  if (v.quantity_working === 0 && v.quantity_retired > 0) return "retired";
  return "working";
}

async function ctx() {
  const { requireAdmin } = await import("@/lib/admin.server");
  const admin = await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { admin, supabase: supabaseAdmin };
}

type Snapshot = Record<(typeof TRACKED)[number], Json>;
function snapshot(row: Tables<"inventory_items">, categoryName: string): Snapshot {
  return {
    name: row.name,
    category: categoryName,
    location: row.location,
    date_added: row.date_added,
    notes: row.notes,
    quantity_total: row.quantity_total,
    quantity_working: row.quantity_working,
    quantity_faulty: row.quantity_faulty,
    quantity_maintenance: row.quantity_maintenance,
    quantity_missing: row.quantity_missing,
    quantity_retired: row.quantity_retired,
  };
}

function diff(before: Snapshot | null, after: Snapshot | null) {
  const out: Record<string, FieldChange> = {};
  for (const key of TRACKED) {
    const a = before?.[key];
    const b = after?.[key];
    if (before && after) {
      if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = { from: a, to: b };
    } else if (after) {
      if (b !== "" && b !== null && b !== undefined) out[key] = { to: b };
    } else if (a !== "" && a !== null && a !== undefined) out[key] = { from: a };
  }
  return out;
}

// ── Reads ─────────────────────────────────────────────────────────────────────
export const getInventoryDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, supabase } = await ctx();
  const [items, categories, audits, lastEdits] = await Promise.all([
    supabase.from("inventory_items").select("*").order("name"),
    supabase.from("categories").select("*").order("name"),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8),
    supabase
      .from("audit_logs")
      .select("item_id, actor_name, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (items.error || categories.error || audits.error || lastEdits.error)
    throw new Error("Inventory data could not be loaded.");

  const catNames = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const lastBy = new Map<string, string>();
  for (const e of lastEdits.data ?? [])
    if (e.item_id && !lastBy.has(e.item_id)) lastBy.set(e.item_id, e.actor_name);
  const counts = new Map<string, number>();
  for (const i of items.data ?? []) counts.set(i.category_id, (counts.get(i.category_id) ?? 0) + 1);

  return {
    me: {
      id: admin.id,
      display_name: admin.display_name,
      role: admin.role,
      username: admin.username,
    },
    items: (items.data ?? []).map((i): InventoryItem => ({
      ...i,
      category_name: catNames.get(i.category_id) ?? "",
      updated_by_name: lastBy.get(i.id) ?? null,
    })),
    categories: (categories.data ?? []).map((c): Category => ({
      ...c,
      item_count: counts.get(c.id) ?? 0,
    })),
    audits: audits.data ?? [],
  };
});

export const getHistory = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        itemId: z.string().uuid().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabase } = await ctx();
    let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
    if (data.itemId) q = q.eq("item_id", data.itemId);
    const { data: rows, error } = await q.range(data.offset, data.offset + data.limit);
    if (error) throw new Error("History could not be loaded.");
    const list = rows ?? [];
    return { entries: list.slice(0, data.limit), hasMore: list.length > data.limit };
  });

// ── Items ─────────────────────────────────────────────────────────────────────
const count = z.number().int().min(0).max(1_000_000);
const itemSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, "Give the equipment a name.").max(120),
    category_id: z.string().uuid("Choose a category."),
    quantity_total: count,
    quantity_working: count,
    quantity_faulty: count,
    quantity_maintenance: count,
    quantity_missing: count,
    quantity_retired: count,
    location: z.string().trim().min(2, "Enter where the equipment is kept.").max(120),
    notes: z.string().trim().max(1000),
    date_added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  })
  .refine(
    (v) =>
      v.quantity_working +
        v.quantity_faulty +
        v.quantity_maintenance +
        v.quantity_missing +
        v.quantity_retired ===
      v.quantity_total,
    { message: "The condition counts must add up to the total quantity." },
  );

export const saveInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((data) => itemSchema.parse(data))
  .handler(async ({ data }) => {
    const { admin, supabase } = await ctx();
    const { id, ...values } = data;
    const row = { ...values, condition: deriveCondition(values), updated_by: admin.id };
    const { data: cat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", values.category_id)
      .maybeSingle();
    if (!cat) throw new Error("That category no longer exists. Pick another one.");

    if (id) {
      const { data: before } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!before) throw new Error("This item was deleted by someone else.");
      const { data: beforeCat } = await supabase
        .from("categories")
        .select("name")
        .eq("id", before.category_id)
        .maybeSingle();
      const { data: after, error } = await supabase
        .from("inventory_items")
        .update(row)
        .eq("id", id)
        .select("*")
        .single();
      if (error || !after) throw new Error("The item could not be saved.");
      const changes = diff(snapshot(before, beforeCat?.name ?? ""), snapshot(after, cat.name));
      if (Object.keys(changes).length) {
        await supabase.from("audit_logs").insert({
          item_id: id,
          actor_id: admin.id,
          actor_name: admin.display_name,
          action: "updated",
          item_name: after.name,
          changes,
        });
      }
      return { ok: true, id };
    }

    const { data: created, error } = await supabase
      .from("inventory_items")
      .insert({ ...row, created_by: admin.id })
      .select("*")
      .single();
    if (error || !created) throw new Error("The item could not be added.");
    await supabase.from("audit_logs").insert({
      item_id: created.id,
      actor_id: admin.id,
      actor_name: admin.display_name,
      action: "created",
      item_name: created.name,
      changes: diff(null, snapshot(created, cat.name)),
    });
    return { ok: true, id: created.id };
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { admin, supabase } = await ctx();
    const { data: before } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) return { ok: true };
    const { data: cat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", before.category_id)
      .maybeSingle();
    await supabase.from("audit_logs").insert({
      item_id: before.id,
      actor_id: admin.id,
      actor_name: admin.display_name,
      action: "deleted",
      item_name: before.name,
      changes: diff(snapshot(before, cat?.name ?? ""), null),
    });
    const { error } = await supabase.from("inventory_items").delete().eq("id", data.id);
    if (error) throw new Error("The item could not be deleted.");
    return { ok: true };
  });

// ── Categories ────────────────────────────────────────────────────────────────
const catName = z.string().trim().min(2, "Category names need at least 2 characters.").max(80);

export const addCategory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ name: catName }).parse(data))
  .handler(async ({ data }) => {
    const { admin, supabase } = await ctx();
    const { error } = await supabase
      .from("categories")
      .insert({ name: data.name, created_by: admin.id });
    if (error)
      return {
        ok: false as const,
        message:
          error.code === "23505"
            ? "That category already exists."
            : "The category could not be added.",
      };
    return { ok: true as const };
  });

export const renameCategory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid(), name: catName }).parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await ctx();
    const { error } = await supabase
      .from("categories")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error)
      return {
        ok: false as const,
        message:
          error.code === "23505"
            ? "That category already exists."
            : "The category could not be renamed.",
      };
    return { ok: true as const };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await ctx();
    const { count: used } = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);
    if (used)
      return {
        ok: false as const,
        message: `${used} item${used === 1 ? " is" : "s are"} still in this category. Move ${used === 1 ? "it" : "them"} to another category first.`,
      };
    const { error } = await supabase.from("categories").delete().eq("id", data.id);
    if (error) return { ok: false as const, message: "The category could not be deleted." };
    return { ok: true as const };
  });
