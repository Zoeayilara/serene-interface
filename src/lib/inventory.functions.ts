import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

const sessionConfig = () => ({
  password: process.env['SESSION_SECRET']!,
  name: "nacos-hardware-admin",
  maxAge: 60 * 60 * 12,
  cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
});

type AdminSession = { unlocked?: boolean };

function matches(input: string, expected: string) {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

async function requireAdmin() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (!session.data.unlocked) throw redirect({ to: "/login" });
}

export const getSessionState = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  return { unlocked: Boolean(session.data.unlocked) };
});

export const signInAdmin = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const username = process.env['ADMIN_USERNAME'];
    const password = process.env['ADMIN_PASSWORD'];
    if (!username || !password) throw new Error("Administrator credentials are not configured.");
    const ok = matches(data.username.trim(), username) && matches(data.password, password);
    if (!ok) return { ok: false as const };
    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const signOutAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  await session.clear();
  return { ok: true };
});

export const getInventoryDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: items, error: itemsError }, { data: categories, error: categoriesError }, { data: audits, error: auditsError }] = await Promise.all([
    supabaseAdmin.from("inventory_items").select("*, categories(name)").order("updated_at", { ascending: false }),
    supabaseAdmin.from("categories").select("*").order("name"),
    supabaseAdmin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8),
  ]);
  if (itemsError || categoriesError || auditsError) throw new Error("Inventory data could not be loaded.");
  return { items: items ?? [], categories: categories ?? [], audits: audits ?? [] };
});

const itemSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(2).max(120), category_id: z.string().uuid(),
  quantity_total: z.number().int().min(0), quantity_working: z.number().int().min(0), quantity_faulty: z.number().int().min(0),
  quantity_maintenance: z.number().int().min(0), quantity_missing: z.number().int().min(0), quantity_retired: z.number().int().min(0),
  condition: z.enum(["working", "faulty", "under_maintenance", "missing", "retired"]), location: z.string().trim().min(2).max(120),
  notes: z.string().max(1000), date_added: z.string(),
}).refine((v) => v.quantity_working + v.quantity_faulty + v.quantity_maintenance + v.quantity_missing + v.quantity_retired === v.quantity_total,
  { message: "Condition quantities must equal the total quantity." });

export const saveInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((data) => itemSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = "00000000-0000-0000-0000-000000000001";
    const { id, ...values } = data;
    if (id) {
      const { data: before } = await supabaseAdmin.from("inventory_items").select("*").eq("id", id).single();
      const { error } = await supabaseAdmin.from("inventory_items").update({ ...values, updated_by: actor }).eq("id", id);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("audit_logs").insert({ item_id: id, actor_id: actor, action: "updated", item_name: data.name, changes: { before, after: values } });
      return { ok: true, id };
    }
    const { data: created, error } = await supabaseAdmin.from("inventory_items").insert({ ...values, created_by: actor, updated_by: actor }).select("id").single();
    if (error || !created) throw new Error(error?.message ?? "Item could not be created.");
    await supabaseAdmin.from("audit_logs").insert({ item_id: created.id, actor_id: actor, action: "created", item_name: data.name, changes: { after: values } });
    return { ok: true, id: created.id };
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid(), name: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = "00000000-0000-0000-0000-000000000001";
    await supabaseAdmin.from("audit_logs").insert({ actor_id: actor, action: "deleted", item_name: data.name, changes: {} });
    const { error } = await supabaseAdmin.from("inventory_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
