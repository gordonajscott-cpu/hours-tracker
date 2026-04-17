-- Rollback migration 005 (organizations)
-- Run rollback_006.sql FIRST if portfolios were also applied.

DROP FUNCTION IF EXISTS public.join_org_by_invite(TEXT);
DROP FUNCTION IF EXISTS public.create_organization(TEXT);

DROP POLICY IF EXISTS "Admins write org config" ON public.org_config;
DROP POLICY IF EXISTS "Members read org config" ON public.org_config;
DROP POLICY IF EXISTS "Admins manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Members see org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins update own org" ON public.organizations;
DROP POLICY IF EXISTS "Members see own org" ON public.organizations;

DROP INDEX IF EXISTS idx_org_members_user;
DROP INDEX IF EXISTS idx_profiles_org;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS organization_id;

DROP TABLE IF EXISTS public.org_config;
DROP TABLE IF EXISTS public.organization_members;
DROP TABLE IF EXISTS public.organizations;
