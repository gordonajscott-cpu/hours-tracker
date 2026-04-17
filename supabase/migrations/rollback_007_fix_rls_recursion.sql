-- Rollback 007: revert to inline subquery policies and drop helper functions.
-- This restores the original policies from migrations 005 and 006.

-- ── Restore organization_members policies ──

DROP POLICY IF EXISTS "Members see org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins manage members" ON public.organization_members;

CREATE POLICY "Members see org members" ON public.organization_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members my_row WHERE my_row.org_id = organization_members.org_id AND my_row.user_id = auth.uid())
  );

CREATE POLICY "Admins manage members" ON public.organization_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members admin_row WHERE admin_row.org_id = organization_members.org_id AND admin_row.user_id = auth.uid() AND admin_row.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members admin_row WHERE admin_row.org_id = organization_members.org_id AND admin_row.user_id = auth.uid() AND admin_row.role = 'admin')
  );

-- ── Restore organizations policies ──

DROP POLICY IF EXISTS "Members see own org" ON public.organizations;
DROP POLICY IF EXISTS "Admins update own org" ON public.organizations;

CREATE POLICY "Members see own org" ON public.organizations
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = organizations.id AND om.user_id = auth.uid()));

CREATE POLICY "Admins update own org" ON public.organizations
  FOR UPDATE USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = organizations.id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- ── Restore org_config policies ──

DROP POLICY IF EXISTS "Members read org config" ON public.org_config;
DROP POLICY IF EXISTS "Admins write org config" ON public.org_config;

CREATE POLICY "Members read org config" ON public.org_config
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = org_config.org_id AND om.user_id = auth.uid()));

CREATE POLICY "Admins write org config" ON public.org_config
  FOR ALL USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = org_config.org_id AND om.user_id = auth.uid() AND om.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = org_config.org_id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- ── Restore portfolios policies ──

DROP POLICY IF EXISTS "Org members see portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Admins manage portfolios" ON public.portfolios;

CREATE POLICY "Org members see portfolios" ON public.portfolios
  FOR SELECT USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = portfolios.org_id AND om.user_id = auth.uid()));

CREATE POLICY "Admins manage portfolios" ON public.portfolios
  FOR ALL USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = portfolios.org_id AND om.user_id = auth.uid() AND om.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = portfolios.org_id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- ── Restore portfolio_members policies ──

DROP POLICY IF EXISTS "See portfolio members" ON public.portfolio_members;
DROP POLICY IF EXISTS "Admins manage portfolio members" ON public.portfolio_members;

CREATE POLICY "See portfolio members" ON public.portfolio_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portfolio_members my_pm WHERE my_pm.portfolio_id = portfolio_members.portfolio_id AND my_pm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM portfolios p JOIN organization_members om ON om.org_id = p.org_id WHERE p.id = portfolio_members.portfolio_id AND om.user_id = auth.uid())
  );

CREATE POLICY "Admins manage portfolio members" ON public.portfolio_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portfolios p JOIN organization_members om ON om.org_id = p.org_id WHERE p.id = portfolio_members.portfolio_id AND om.user_id = auth.uid() AND om.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM portfolios p JOIN organization_members om ON om.org_id = p.org_id WHERE p.id = portfolio_members.portfolio_id AND om.user_id = auth.uid() AND om.role = 'admin')
  );

-- ── Restore cross-table policies ──

DROP POLICY IF EXISTS "Portfolio managers read member entries" ON public.time_entries;
DROP POLICY IF EXISTS "Portfolio managers read member tasks" ON public.tasks;

CREATE POLICY "Portfolio managers read member entries" ON public.time_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portfolio_members pm_me JOIN portfolio_members pm_them ON pm_me.portfolio_id = pm_them.portfolio_id JOIN profiles p ON p.user_id = time_entries.user_id AND p.id = time_entries.profile_id AND p.organization_id IS NOT NULL WHERE pm_me.user_id = auth.uid() AND pm_me.role = 'manager' AND pm_them.user_id = time_entries.user_id)
  );

CREATE POLICY "Portfolio managers read member tasks" ON public.tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portfolio_members pm_me JOIN portfolio_members pm_them ON pm_me.portfolio_id = pm_them.portfolio_id JOIN profiles p ON p.user_id = tasks.user_id AND p.id = tasks.profile_id AND p.organization_id IS NOT NULL WHERE pm_me.user_id = auth.uid() AND pm_me.role = 'manager' AND pm_them.user_id = tasks.user_id)
  );

-- ── Drop helper functions ──

DROP FUNCTION IF EXISTS public.is_org_member(UUID);
DROP FUNCTION IF EXISTS public.is_org_admin(UUID);
DROP FUNCTION IF EXISTS public.is_portfolio_member(UUID);
DROP FUNCTION IF EXISTS public.is_portfolio_manager_of(UUID);
DROP FUNCTION IF EXISTS public.user_has_org_profile(UUID, TEXT);
