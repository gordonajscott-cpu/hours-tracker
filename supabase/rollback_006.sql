-- Rollback migration 006 (portfolios)
-- Run this BEFORE rollback_005.sql if both need reverting.

DROP POLICY IF EXISTS "Portfolio managers read member tasks" ON public.tasks;
DROP POLICY IF EXISTS "Portfolio managers read member entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admins manage portfolio members" ON public.portfolio_members;
DROP POLICY IF EXISTS "See portfolio members" ON public.portfolio_members;
DROP POLICY IF EXISTS "Admins manage portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Org members see portfolios" ON public.portfolios;

DROP INDEX IF EXISTS idx_portfolio_members_user;
DROP INDEX IF EXISTS idx_portfolios_org;

DROP TABLE IF EXISTS public.portfolio_members;
DROP TABLE IF EXISTS public.portfolios;
