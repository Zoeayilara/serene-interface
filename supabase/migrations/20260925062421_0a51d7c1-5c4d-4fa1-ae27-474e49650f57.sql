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