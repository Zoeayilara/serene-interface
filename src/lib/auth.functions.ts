import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,32}$/,
    "Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.",
  );
const passwordSchema = z.string().min(8, "Passwords need at least 8 characters.").max(128);
const nameSchema = z.string().trim().min(2, "Enter a name.").max(80);
const roleSchema = z.enum(["hardware_director", "assistant_hardware_director"]);

export const getSessionState = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentAdmin, toPublic } = await import("@/lib/admin.server");
  const admin = await getCurrentAdmin();
  return { admin: admin ? toPublic(admin) : null };
});

export const signInAdmin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { signIn } = await import("@/lib/admin.server");
    return signIn(data.username, data.password);
  });

export const signOutAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { endSession } = await import("@/lib/admin.server");
  await endSession();
  return { ok: true };
});

export const listAdmins = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin, toPublic } = await import("@/lib/admin.server");
  const me = await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("admin_accounts")
    .select("*")
    .order("created_at");
  if (error) throw new Error("Accounts could not be loaded.");
  return {
    me: toPublic(me),
    admins: (data ?? []).map((a) => ({ ...toPublic(a), last_login_at: a.last_login_at })),
  };
});

export const updateMyName = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ display_name: nameSchema }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    const me = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update({ display_name: data.display_name })
      .eq("id", me.id);
    if (error) throw new Error("Your name could not be saved.");
    return { ok: true };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ current: z.string().min(1), next: passwordSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const { openAdminSession, requireAdmin, verifyPassword, hashPassword, startSession } =
      await import("@/lib/admin.server");
    const session = await openAdminSession();
    const me = await requireAdmin(session);
    if (!(await verifyPassword(data.current, me.password_hash)))
      return { ok: false as const, message: "Your current password is incorrect." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("admin_accounts")
      .update({
        password_hash: await hashPassword(data.next),
        session_version: me.session_version + 1,
      })
      .eq("id", me.id)
      .select("*")
      .single();
    if (error || !updated) throw new Error("Your password could not be changed.");
    await startSession(session, updated); // stay signed in here; other devices are signed out
    return { ok: true as const };
  });

export const createAdmin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        username: usernameSchema,
        display_name: nameSchema,
        role: roleSchema,
        password: passwordSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireDirector, hashPassword } = await import("@/lib/admin.server");
    await requireDirector();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_accounts").insert({
      username: data.username,
      display_name: data.display_name,
      role: data.role,
      password_hash: await hashPassword(data.password),
    });
    if (error) {
      if (error.code === "23505")
        return { ok: false as const, message: "That username is already taken." };
      throw new Error("The account could not be created.");
    }
    return { ok: true as const };
  });

export const resetAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), password: passwordSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireDirector, hashPassword } = await import("@/lib/admin.server");
    const me = await requireDirector();
    if (data.id === me.id)
      return { ok: false as const, message: "Change your own password in the section above." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("admin_accounts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!target) return { ok: false as const, message: "That account no longer exists." };
    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update({
        password_hash: await hashPassword(data.password),
        session_version: target.session_version + 1,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", data.id);
    if (error) throw new Error("The password could not be reset.");
    return { ok: true as const };
  });

export const removeAdmin = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { requireDirector } = await import("@/lib/admin.server");
    const me = await requireDirector();
    if (data.id === me.id)
      return { ok: false as const, message: "You can't remove your own account." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_accounts").delete().eq("id", data.id);
    if (error) throw new Error("The account could not be removed.");
    return { ok: true as const };
  });
