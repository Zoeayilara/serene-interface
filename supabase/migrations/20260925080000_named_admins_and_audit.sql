-- Named administrator accounts, attributable audit history, and a locked-down data API.
--
-- The app talks to the database only from its server functions (service role),
-- behind its own session. Nothing here needs Supabase Auth.

-- 1. Administrator accounts ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  role public.app_role NOT NULL,
  password_hash text NOT NULL,
  session_version integer NOT NULL DEFAULT 1,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the server (service role) can read or write accounts.
REVOKE ALL ON public.admin_accounts FROM anon, authenticated;
GRANT ALL ON public.admin_accounts TO service_role;

DROP TRIGGER IF EXISTS admin_accounts_updated_at ON public.admin_accounts;
CREATE TRIGGER admin_accounts_updated_at BEFORE UPDATE ON public.admin_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Audit history: record who made each change, and keep it append-only ------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_name text NOT NULL DEFAULT 'Hardware Admin';
CREATE INDEX IF NOT EXISTS audit_logs_item_idx ON public.audit_logs(item_id, created_at DESC);

-- Not even the server can edit or delete history entries.
-- (Deleting an item still works: the item_id link is cleared by the foreign key itself.)
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM service_role;

-- 3. Category names are unique regardless of capitals ("Laptops" and "laptops" are the same)
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_key ON public.categories (lower(name));

-- 4. Close the public data API ------------------------------------------------
-- Previously any signed-up Supabase user could insert themselves into user_roles
-- and then read and change the inventory directly, bypassing the app's login.
DROP POLICY IF EXISTS "Users can initialize their role" ON public.user_roles;
REVOKE ALL ON public.user_roles, public.profiles, public.categories,
              public.inventory_items, public.audit_logs FROM anon, authenticated;
