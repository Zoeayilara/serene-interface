// Server-only helpers. Import these dynamically inside server function handlers:
//   const { requireAdmin } = await import("@/lib/admin.server");
import { redirect } from "@tanstack/react-router";
import { useSession as openSession } from "@tanstack/react-start/server";
import type { Tables } from "@/integrations/supabase/types";

export type AdminAccount = Tables<"admin_accounts">;
export type PublicAdmin = Pick<AdminAccount, "id" | "username" | "display_name" | "role">;

type AdminSession = { adminId?: string; v?: number };

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function sessionConfig() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32)
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return {
    password,
    name: "nacos-hardware-admin",
    maxAge: 60 * 60 * 12,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function toPublic(a: AdminAccount): PublicAdmin {
  return { id: a.id, username: a.username, display_name: a.display_name, role: a.role };
}

// ── Password hashing (PBKDF2-SHA256 via Web Crypto; works on Node and Cloudflare Workers)
const ITERATIONS = 100_000;
const enc = new TextEncoder();
const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256),
  );
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, algo, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || algo !== "sha256" || !salt || !hash) return false;
  const derived = await derive(password, fromB64(salt), Number(iter));
  return sameBytes(derived, fromB64(hash));
}

async function equalStrings(a: string, b: string) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return sameBytes(new Uint8Array(x), new Uint8Array(y));
}

// ── Sessions
// A request opens its session handle once, at the start, and passes it to
// anything that reads or writes the session, so every step uses the same one.
export type SessionHandle = Awaited<ReturnType<typeof openSession<AdminSession>>>;

export function openAdminSession(): Promise<SessionHandle> {
  return openSession<AdminSession>(sessionConfig());
}

export async function getCurrentAdmin(existing?: SessionHandle): Promise<AdminAccount | null> {
  const session = existing ?? (await openAdminSession());
  const { adminId, v } = session.data;
  if (!adminId) return null;
  const { data } = await (
    await db()
  )
    .from("admin_accounts")
    .select("*")
    .eq("id", adminId)
    .maybeSingle();
  if (!data || data.session_version !== v) {
    await session.clear();
    return null;
  }
  return data;
}

export async function requireAdmin(existing?: SessionHandle) {
  const admin = await getCurrentAdmin(existing);
  if (!admin) throw redirect({ to: "/login" });
  return admin;
}

export async function requireDirector(existing?: SessionHandle) {
  const admin = await requireAdmin(existing);
  if (admin.role !== "hardware_director")
    throw new Error("Only the Hardware Director can do that.");
  return admin;
}

export async function startSession(session: SessionHandle, admin: AdminAccount) {
  await session.update({ adminId: admin.id, v: admin.session_version });
}

export async function endSession() {
  const session = await openAdminSession();
  await session.clear();
}

// ── Sign in
export type SignInResult = { ok: true } | { ok: false; message: string };

export async function signIn(usernameRaw: string, password: string): Promise<SignInResult> {
  const session = await openAdminSession();
  const supabase = await db();
  const username = usernameRaw.trim().toLowerCase();
  const wrong: SignInResult = { ok: false, message: "The username or password is incorrect." };

  const { data: account } = await supabase
    .from("admin_accounts")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!account) {
    // No Hardware Director yet (first run, or the Director account was deleted to recover
    // access): the username/password from the environment variables create one.
    // While a Director exists, those variables are ignored.
    const { count } = await supabase
      .from("admin_accounts")
      .select("id", { count: "exact", head: true })
      .eq("role", "hardware_director");
    const envUser = process.env["ADMIN_USERNAME"]?.trim().toLowerCase();
    const envPass = process.env["ADMIN_PASSWORD"];
    if (
      !count &&
      envUser &&
      envPass &&
      (await equalStrings(username, envUser)) &&
      (await equalStrings(password, envPass))
    ) {
      const safeUsername = /^[a-z0-9._-]{3,32}$/.test(envUser) ? envUser : "director";
      const { data: created, error } = await supabase
        .from("admin_accounts")
        .insert({
          username: safeUsername,
          display_name: "Hardware Director",
          role: "hardware_director",
          password_hash: await hashPassword(password),
          last_login_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error || !created)
        return { ok: false, message: "The first account could not be created. Try again." };
      await startSession(session, created);
      return { ok: true };
    }
    await hashPassword(password); // keep response time similar for unknown usernames
    return wrong;
  }

  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(account.locked_until).getTime() - Date.now()) / 60000);
    return {
      ok: false,
      message: `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  if (!(await verifyPassword(password, account.password_hash))) {
    const attempts = account.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await supabase
      .from("admin_accounts")
      .update({
        failed_attempts: lock ? 0 : attempts,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
      })
      .eq("id", account.id);
    return lock
      ? {
          ok: false,
          message: `Too many wrong attempts. This account is locked for ${LOCK_MINUTES} minutes.`,
        }
      : wrong;
  }

  await supabase
    .from("admin_accounts")
    .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq("id", account.id);
  await startSession(session, account);
  return { ok: true };
}
