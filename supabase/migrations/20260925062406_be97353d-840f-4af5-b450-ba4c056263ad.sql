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

WITH c AS (SELECT id, name FROM public.categories)
INSERT INTO public.inventory_items (name, category_id, quantity_total, quantity_working, quantity_faulty, quantity_maintenance, quantity_missing, quantity_retired, condition, location, notes, date_added)
VALUES
  ('Desktop Computers', (SELECT id FROM c WHERE name = 'Computers'), 30, 25, 3, 2, 0, 0, 'faulty', 'Computer Laboratory', 'Three systems require RAM replacement.', current_date - 90),
  ('Dell Monitors', (SELECT id FROM c WHERE name = 'Monitors'), 28, 26, 1, 1, 0, 0, 'under_maintenance', 'Computer Laboratory', 'One display has intermittent power.', current_date - 82),
  ('HP LaserJet Printer', (SELECT id FROM c WHERE name = 'Printers'), 4, 3, 1, 0, 0, 0, 'faulty', 'Hardware Office', 'Paper feed requires service.', current_date - 61),
  ('Epson Projectors', (SELECT id FROM c WHERE name = 'Projectors'), 6, 5, 0, 1, 0, 0, 'under_maintenance', 'Equipment Store', 'Lamp replacement scheduled.', current_date - 48),
  ('Cisco Network Switches', (SELECT id FROM c WHERE name = 'Networking Equipment'), 8, 8, 0, 0, 0, 0, 'working', 'Network Room', '', current_date - 35),
  ('UPS Units', (SELECT id FROM c WHERE name = 'Power Equipment'), 12, 9, 2, 1, 0, 0, 'faulty', 'Computer Laboratory', 'Battery health check pending.', current_date - 20);