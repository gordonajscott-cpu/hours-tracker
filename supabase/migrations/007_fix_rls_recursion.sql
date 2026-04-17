-- Fix infinite recursion in RLS policies.
--
-- The self-referential policies on organization_members (querying itself to
-- check membership) create a recursive evaluation chain when cross-table
-- policies on time_entries/tasks reference portfolio_members, which in turn
-- reference organization_members.
--
-- Fix: SECURITY DEFINER helper functions bypass RLS on the inner lookup,
-- breaking the cycle.

-- ── Helper functions ──

CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id UUID)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(check_org_id UUID)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_portfolio_member(check_portfolio_id UUID)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM portfolio_members
    WHERE portfolio_id = check_portfolio_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_portfolio_manager_of(target_user_id UUID)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM portfolio_members pm_me
    JOIN portfolio_members pm_them ON pm_me.portfolio_id = pm_them.portfolio_id
    WHERE pm_me.user_id = auth.uid()
      AND pm_me.role = 'manager'
      AND pm_them.user_id = target_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_org_profile(target_user_id UUID, target_profile_id TEXT)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = target_user_id AND id = target_profile_id AND organization_id IS NOT NULL
  );
$$;

-- ── Replace organization_members policies ──

DROP POLICY IF EXISTS "Members see org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins manage members" ON public.organization_members;

CREATE POLICY "Members see org members" ON public.organization_members
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "Admins manage members" ON public.organization_members
  FOR ALL USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

-- ── Replace organizations policies ──

DROP POLICY IF EXISTS "Members see own org" ON public.organizations;
DROP POLICY IF EXISTS "Admins update own org" ON public.organizations;

CREATE POLICY "Members see own org" ON public.organizations
  FOR SELECT USING (is_org_member(id));

CREATE POLICY "Admins update own org" ON public.organizations
  FOR UPDATE USING (is_org_admin(id));

-- ── Replace org_config policies ──

DROP POLICY IF EXISTS "Members read org config" ON public.org_config;
DROP POLICY IF EXISTS "Admins write org config" ON public.org_config;

CREATE POLICY "Members read org config" ON public.org_config
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "Admins write org config" ON public.org_config
  FOR ALL USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

-- ── Replace portfolios policies ──

DROP POLICY IF EXISTS "Org members see portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Admins manage portfolios" ON public.portfolios;

CREATE POLICY "Org members see portfolios" ON public.portfolios
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "Admins manage portfolios" ON public.portfolios
  FOR ALL USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

-- ── Replace portfolio_members policies ──

DROP POLICY IF EXISTS "See portfolio members" ON public.portfolio_members;
DROP POLICY IF EXISTS "Admins manage portfolio members" ON public.portfolio_members;

CREATE POLICY "See portfolio members" ON public.portfolio_members
  FOR SELECT USING (
    is_portfolio_member(portfolio_id)
    OR is_org_member((SELECT org_id FROM portfolios WHERE id = portfolio_id))
  );

CREATE POLICY "Admins manage portfolio members" ON public.portfolio_members
  FOR ALL USING (
    is_org_admin((SELECT org_id FROM portfolios WHERE id = portfolio_id))
  ) WITH CHECK (
    is_org_admin((SELECT org_id FROM portfolios WHERE id = portfolio_id))
  );

-- ── Replace cross-table policies on time_entries / tasks ──

DROP POLICY IF EXISTS "Portfolio managers read member entries" ON public.time_entries;
DROP POLICY IF EXISTS "Portfolio managers read member tasks" ON public.tasks;

CREATE POLICY "Portfolio managers read member entries" ON public.time_entries
  FOR SELECT USING (
    is_portfolio_manager_of(user_id)
    AND user_has_org_profile(user_id, profile_id)
  );

CREATE POLICY "Portfolio managers read member tasks" ON public.tasks
  FOR SELECT USING (
    is_portfolio_manager_of(user_id)
    AND user_has_org_profile(user_id, profile_id)
  );
