-- Portfolios: groups within an organization whose members' work can be
-- viewed by portfolio managers. Admins create portfolios and assign members.
-- Requires migrations 004 (profiles) and 005 (organizations).

CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.portfolio_members (
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'member')),
  PRIMARY KEY (portfolio_id, user_id)
);

ALTER TABLE public.portfolio_members ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_members_user ON public.portfolio_members(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_org ON public.portfolios(org_id);

-- ── RLS Policies ──

-- Org members can see portfolios in their org
CREATE POLICY "Org members see portfolios" ON public.portfolios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = portfolios.org_id AND om.user_id = auth.uid()
    )
  );

-- Admins can manage portfolios in their org
CREATE POLICY "Admins manage portfolios" ON public.portfolios
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = portfolios.org_id AND om.user_id = auth.uid() AND om.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = portfolios.org_id AND om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- Portfolio members and org members can see portfolio membership
CREATE POLICY "See portfolio members" ON public.portfolio_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portfolio_members my_pm
      WHERE my_pm.portfolio_id = portfolio_members.portfolio_id AND my_pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM portfolios p
      JOIN organization_members om ON om.org_id = p.org_id
      WHERE p.id = portfolio_members.portfolio_id AND om.user_id = auth.uid()
    )
  );

-- Admins can manage portfolio membership
CREATE POLICY "Admins manage portfolio members" ON public.portfolio_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN organization_members om ON om.org_id = p.org_id
      WHERE p.id = portfolio_members.portfolio_id
        AND om.user_id = auth.uid() AND om.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN organization_members om ON om.org_id = p.org_id
      WHERE p.id = portfolio_members.portfolio_id
        AND om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- ── Cross-table read access for portfolio managers ──
-- Postgres ORs multiple SELECT policies, so these extend the existing
-- "Users access own entries/tasks" policies without replacing them.

-- Portfolio managers can read time entries of members (org-linked profiles only)
CREATE POLICY "Portfolio managers read member entries" ON public.time_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm_me
      JOIN portfolio_members pm_them ON pm_me.portfolio_id = pm_them.portfolio_id
      JOIN profiles p ON p.user_id = time_entries.user_id
        AND p.id = time_entries.profile_id
        AND p.organization_id IS NOT NULL
      WHERE pm_me.user_id = auth.uid()
        AND pm_me.role = 'manager'
        AND pm_them.user_id = time_entries.user_id
    )
  );

-- Portfolio managers can read tasks of members (org-linked profiles only)
CREATE POLICY "Portfolio managers read member tasks" ON public.tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm_me
      JOIN portfolio_members pm_them ON pm_me.portfolio_id = pm_them.portfolio_id
      JOIN profiles p ON p.user_id = tasks.user_id
        AND p.id = tasks.profile_id
        AND p.organization_id IS NOT NULL
      WHERE pm_me.user_id = auth.uid()
        AND pm_me.role = 'manager'
        AND pm_them.user_id = tasks.user_id
    )
  );
