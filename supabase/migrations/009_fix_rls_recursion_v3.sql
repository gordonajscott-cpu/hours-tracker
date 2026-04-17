-- Fix remaining self-referential RLS recursion.
--
-- Migration 008 used _org_ids_for_uid() (SECURITY DEFINER) for SELECT
-- policies but left the admin/write policies with direct self-referential
-- subqueries on organization_members.  Those still cause infinite recursion.
--
-- This migration adds _admin_org_ids_for_uid() and rewrites every policy
-- that touches organization_members to go through SECURITY DEFINER helpers.

-- ── Helper: admin org IDs ──

CREATE OR REPLACE FUNCTION public._admin_org_ids_for_uid()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role = 'admin';
$$;

-- ── Drop and recreate ALL org/portfolio policies ──

-- organization_members
DROP POLICY IF EXISTS "Members see org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins manage members" ON public.organization_members;

CREATE POLICY "Members see org members" ON public.organization_members
  FOR SELECT USING (org_id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins manage members" ON public.organization_members
  FOR ALL USING (org_id IN (SELECT _admin_org_ids_for_uid()))
  WITH CHECK (org_id IN (SELECT _admin_org_ids_for_uid()));

-- organizations
DROP POLICY IF EXISTS "Members see own org" ON public.organizations;
DROP POLICY IF EXISTS "Admins update own org" ON public.organizations;

CREATE POLICY "Members see own org" ON public.organizations
  FOR SELECT USING (id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins update own org" ON public.organizations
  FOR UPDATE USING (id IN (SELECT _admin_org_ids_for_uid()));

-- org_config
DROP POLICY IF EXISTS "Members read org config" ON public.org_config;
DROP POLICY IF EXISTS "Admins write org config" ON public.org_config;

CREATE POLICY "Members read org config" ON public.org_config
  FOR SELECT USING (org_id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins write org config" ON public.org_config
  FOR ALL USING (org_id IN (SELECT _admin_org_ids_for_uid()))
  WITH CHECK (org_id IN (SELECT _admin_org_ids_for_uid()));

-- portfolios
DROP POLICY IF EXISTS "Org members see portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Admins manage portfolios" ON public.portfolios;

CREATE POLICY "Org members see portfolios" ON public.portfolios
  FOR SELECT USING (org_id IN (SELECT _org_ids_for_uid()));

CREATE POLICY "Admins manage portfolios" ON public.portfolios
  FOR ALL USING (org_id IN (SELECT _admin_org_ids_for_uid()))
  WITH CHECK (org_id IN (SELECT _admin_org_ids_for_uid()));

-- portfolio_members
DROP POLICY IF EXISTS "See portfolio members" ON public.portfolio_members;
DROP POLICY IF EXISTS "Admins manage portfolio members" ON public.portfolio_members;

CREATE POLICY "See portfolio members" ON public.portfolio_members
  FOR SELECT USING (
    portfolio_id IN (
      SELECT p.id FROM portfolios p WHERE p.org_id IN (SELECT _org_ids_for_uid())
    )
  );

CREATE POLICY "Admins manage portfolio members" ON public.portfolio_members
  FOR ALL USING (
    portfolio_id IN (
      SELECT p.id FROM portfolios p WHERE p.org_id IN (SELECT _admin_org_ids_for_uid())
    )
  ) WITH CHECK (
    portfolio_id IN (
      SELECT p.id FROM portfolios p WHERE p.org_id IN (SELECT _admin_org_ids_for_uid())
    )
  );

-- ── Ensure no cross-table policies on time_entries / tasks ──
DROP POLICY IF EXISTS "Portfolio managers read member entries" ON public.time_entries;
DROP POLICY IF EXISTS "Portfolio managers read member tasks" ON public.tasks;
