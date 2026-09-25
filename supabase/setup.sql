-- NACOS Hardware Inventory: database setup for a NEW Supabase project.
-- Supabase dashboard → SQL Editor → New query → paste this whole file → Run. Run it once.
-- It creates the tables, security rules and default categories (no sample equipment).
-- These are the same steps as the files in supabase/migrations/, in order.

-- ─── from 20260925062406_be97353d-840f-4af5-b450-ba4c056263ad.sql ───
CREATE TYPE public.app_role AS ENUM ('hardware_director', 'assistant_hardware_director');
CREATE TYPE public.item_condition AS ENUM ('working', 'faulty', 'under_maintenance', 'missing', 'retired');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create their profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'assistant_hardware_director',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can initialize their role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND role = 'assistant_hardware_director');

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_hardware_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;
GRANT EXECUTE ON FUNCTION public.is_hardware_admin(uuid) TO authenticated;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 80),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read categories" ON public.categories FOR SELECT TO authenticated USING (public.is_hardware_admin(auth.uid()));
CREATE POLICY "Admins can create categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_hardware_admin(auth.uid()) AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO authenticated USING (public.is_hardware_admin(auth.uid())) WITH CHECK (public.is_hardware_admin(auth.uid()));
CREATE POLICY "Directors can delete categories" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'hardware_director'));

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT NOT NULL,
  quantity_total integer NOT NULL CHECK (quantity_total >= 0),
  quantity_working integer NOT NULL DEFAULT 0 CHECK (quantity_working >= 0),
  quantity_faulty integer NOT NULL DEFAULT 0 CHECK (quantity_faulty >= 0),
  quantity_maintenance integer NOT NULL DEFAULT 0 CHECK (quantity_maintenance >= 0),
  quantity_missing integer NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
  quantity_retired integer NOT NULL DEFAULT 0 CHECK (quantity_retired >= 0),
  condition public.item_condition NOT NULL DEFAULT 'working',
  location text NOT NULL CHECK (char_length(location) BETWEEN 2 AND 120),
  notes text NOT NULL DEFAULT '',
  date_added date NOT NULL DEFAULT current_date,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_quantities_balance CHECK (quantity_working + quantity_faulty + quantity_maintenance + quantity_missing + quantity_retired = quantity_total)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read inventory" ON public.inventory_items FOR SELECT TO authenticated USING (public.is_hardware_admin(auth.uid()));
CREATE POLICY "Admins can create inventory" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (public.is_hardware_admin(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
CREATE POLICY "Admins can update inventory" ON public.inventory_items FOR UPDATE TO authenticated USING (public.is_hardware_admin(auth.uid())) WITH CHECK (public.is_hardware_admin(auth.uid()) AND updated_by = auth.uid());
CREATE POLICY "Directors can delete inventory" ON public.inventory_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'hardware_director'));

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  item_name text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit history" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_hardware_admin(auth.uid()));
CREATE POLICY "Admins can create audit history" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_hardware_admin(auth.uid()) AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX inventory_items_name_idx ON public.inventory_items USING gin (to_tsvector('simple', name));
CREATE INDEX inventory_items_category_idx ON public.inventory_items(category_id);
CREATE INDEX inventory_items_condition_idx ON public.inventory_items(condition);
CREATE INDEX inventory_items_location_idx ON public.inventory_items(location);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs(created_at DESC);

INSERT INTO public.categories (name) VALUES
  ('Computers'), ('Monitors'), ('Keyboards'), ('Mouse'), ('Projectors'),
  ('Printers'), ('Networking Equipment'), ('Cables'), ('Power Equipment'), ('Other');

-- ─── from 20260925062421_0a51d7c1-5c4d-4fa1-ae27-474e49650f57.sql ───
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_hardware_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;
REVOKE ALL ON FUNCTION private.is_hardware_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_hardware_admin(uuid) TO authenticated, service_role;

DROP POLICY "Admins can read categories" ON public.categories;
DROP POLICY "Admins can create categories" ON public.categories;
DROP POLICY "Admins can update categories" ON public.categories;
DROP POLICY "Directors can delete categories" ON public.categories;
CREATE POLICY "Admins can read categories" ON public.categories FOR SELECT TO authenticated USING (private.is_hardware_admin(auth.uid()));
CREATE POLICY "Admins can create categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (private.is_hardware_admin(auth.uid()) AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO authenticated USING (private.is_hardware_admin(auth.uid())) WITH CHECK (private.is_hardware_admin(auth.uid()));
CREATE POLICY "Directors can delete categories" ON public.categories FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'hardware_director'));

DROP POLICY "Admins can read inventory" ON public.inventory_items;
DROP POLICY "Admins can create inventory" ON public.inventory_items;
DROP POLICY "Admins can update inventory" ON public.inventory_items;
DROP POLICY "Directors can delete inventory" ON public.inventory_items;
CREATE POLICY "Admins can read inventory" ON public.inventory_items FOR SELECT TO authenticated USING (private.is_hardware_admin(auth.uid()));
CREATE POLICY "Admins can create inventory" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (private.is_hardware_admin(auth.uid()) AND created_by = auth.uid() AND updated_by = auth.uid());
CREATE POLICY "Admins can update inventory" ON public.inventory_items FOR UPDATE TO authenticated USING (private.is_hardware_admin(auth.uid())) WITH CHECK (private.is_hardware_admin(auth.uid()) AND updated_by = auth.uid());
CREATE POLICY "Directors can delete inventory" ON public.inventory_items FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'hardware_director'));

DROP POLICY "Admins can read audit history" ON public.audit_logs;
DROP POLICY "Admins can create audit history" ON public.audit_logs;
CREATE POLICY "Admins can read audit history" ON public.audit_logs FOR SELECT TO authenticated USING (private.is_hardware_admin(auth.uid()));
CREATE POLICY "Admins can create audit history" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (private.is_hardware_admin(auth.uid()) AND actor_id = auth.uid());

DROP FUNCTION public.has_role(uuid, public.app_role);
DROP FUNCTION public.is_hardware_admin(uuid);

-- ─── from 20260925080000_named_admins_and_audit.sql ───
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
