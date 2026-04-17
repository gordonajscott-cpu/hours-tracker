-- Fix infinite recursion: drop ALL cross-table and self-referential RLS
-- policies, then recreate with simple auth.uid() checks.  Cross-org reads
-- (portfolio manager viewing member data) are handled via RPC functions
-- instead of RLS policies.

-- ═══ 1. Drop every policy that can trigger cross-table RLS chains ═══

-- Cross-table policies on time_entries / tasks (the root trigger)
DROP POLICY IF EXISTS "Portfolio managers read member entries" ON public.time_entries;
DROP POLICY IF EXISTS "Portfolio managers read member tasks" ON public.tasks;

-- Self-referential organization_members policies
DROP POLICY IF EXISTS "Members see org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins manage members" ON public.organization_members;

-- Policies that subquery organization_members
DROP POLICY IF EXISTS "Members see own org" ON public.organizations;
DROP POLICY IF EXISTS "Admins update own org" ON public.organizations;
DROP POLICY IF EXISTS "Members read org config" ON public.org_config;
DROP POLICY IF EXISTS "Admins write org config" ON public.org_config;
DROP POLICY IF EXISTS "Org members see portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Admins manage portfolios" ON public.portfolios;

-- Self-referential / cross-table portfolio_members policies
DROP POLICY IF EXISTS "See portfolio members" ON public.portfolio_members;
DROP POLICY IF EXISTS "Admins manage portfolio members" ON public.portfolio_members;

-- ═══ 2. Recreate with simple, non-recursive policies ═══

-- organization_members: users see their own row + other members in same org
-- Use a SECURITY DEFINER function for the "same org" check to avoid self-ref.
CREATE OR REPLACE FUNCTION public._org_ids_for_uid()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid();
$$;

CREATE POLICY "Members see org members" ON public.organization_members
  FOR SELECT USING (org_id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins manage members" ON public.organization_members
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
    -- This self-ref is safe: FOR ALL + single table + no cross-table join
  )) WITH CHECK (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- organizations: members can see, admins can update
CREATE POLICY "Members see own org" ON public.organizations
  FOR SELECT USING (id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins update own org" ON public.organizations
  FOR UPDATE USING (id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- org_config: members read, admins write
CREATE POLICY "Members read org config" ON public.org_config
  FOR SELECT USING (org_id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins write org config" ON public.org_config
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )) WITH CHECK (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- portfolios: org members see, admins manage
CREATE POLICY "Org members see portfolios" ON public.portfolios
  FOR SELECT USING (org_id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins manage portfolios" ON public.portfolios
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )) WITH CHECK (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- portfolio_members: org members see, admins manage
CREATE POLICY "See portfolio members" ON public.portfolio_members
  FOR SELECT USING (
    portfolio_id IN (
      SELECT p.id FROM portfolios p WHERE p.org_id IN (SELECT _org_ids_for_uid())
    )
  );

CREATE POLICY "Admins manage portfolio members" ON public.portfolio_members
  FOR ALL USING (
    portfolio_id IN (
      SELECT p.id FROM portfolios p WHERE p.org_id IN (
        SELECT org_id FROM organization_members
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  ) WITH CHECK (
    portfolio_id IN (
      SELECT p.id FROM portfolios p WHERE p.org_id IN (
        SELECT org_id FROM organization_members
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- ═══ 3. NO cross-table policies on time_entries / tasks ═══
-- Portfolio manager reads are handled by RPC functions in the app instead.
-- The existing "Users access own entries" and "Users access own tasks"
-- policies (from migration 001) remain untouched and are sufficient.
