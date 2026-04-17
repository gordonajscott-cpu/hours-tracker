-- Organizations: groups of users with shared config managed by admins.
-- Users join via invite codes. The first user to create an org becomes admin.
-- Requires migration 004 (profiles table must exist).

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization members (user ↔ org link with role)
CREATE TABLE IF NOT EXISTS public.organization_members (
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  display_name TEXT DEFAULT '',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Org-wide shared config (customers, projects, work orders, activities, tags, etc.)
CREATE TABLE IF NOT EXISTS public.org_config (
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.org_config ENABLE ROW LEVEL SECURITY;

-- Link profiles to organizations (nullable = personal profile)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id)
  WHERE organization_id IS NOT NULL;

-- ── RLS Policies ──

-- Organizations: members can see their own org
CREATE POLICY "Members see own org" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = organizations.id AND om.user_id = auth.uid()
    )
  );

-- Admins can update their org (e.g. regenerate invite code, rename)
CREATE POLICY "Admins update own org" ON public.organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = organizations.id AND om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- Organization members: any member can see fellow members
CREATE POLICY "Members see org members" ON public.organization_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members my_row
      WHERE my_row.org_id = organization_members.org_id AND my_row.user_id = auth.uid()
    )
  );

-- Admins can insert/update/delete members in their org
CREATE POLICY "Admins manage members" ON public.organization_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members admin_row
      WHERE admin_row.org_id = organization_members.org_id
        AND admin_row.user_id = auth.uid()
        AND admin_row.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members admin_row
      WHERE admin_row.org_id = organization_members.org_id
        AND admin_row.user_id = auth.uid()
        AND admin_row.role = 'admin'
    )
  );

-- Org config: any member can read, admins can write
CREATE POLICY "Members read org config" ON public.org_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_config.org_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins write org config" ON public.org_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_config.org_id AND om.user_id = auth.uid() AND om.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_config.org_id AND om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- ── RPC Functions ──

-- Create organization: bootstraps admin membership and empty config
CREATE OR REPLACE FUNCTION public.create_organization(org_name TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
  code TEXT;
  user_email TEXT;
BEGIN
  new_id := gen_random_uuid();
  code := substr(md5(random()::text), 1, 8);
  SELECT COALESCE(email, '') INTO user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO organizations (id, name, invite_code, created_by)
  VALUES (new_id, org_name, code, auth.uid());

  INSERT INTO organization_members (org_id, user_id, role, display_name)
  VALUES (new_id, auth.uid(), 'admin', user_email);

  INSERT INTO org_config (org_id, data) VALUES (new_id, '{}'::jsonb);

  RETURN jsonb_build_object('id', new_id, 'name', org_name, 'invite_code', code);
END;
$$;

-- Join organization by invite code
CREATE OR REPLACE FUNCTION public.join_org_by_invite(code TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_org organizations%ROWTYPE;
  user_email TEXT;
BEGIN
  SELECT * INTO found_org FROM organizations WHERE invite_code = code;
  IF found_org.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;

  SELECT COALESCE(email, '') INTO user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO organization_members (org_id, user_id, role, display_name)
  VALUES (found_org.id, auth.uid(), 'member', user_email)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('org_id', found_org.id, 'name', found_org.name);
END;
$$;
