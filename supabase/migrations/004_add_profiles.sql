-- Profiles: allow a single signed-in user to maintain multiple isolated data
-- sets (e.g. Work vs Personal) with their own config, tasks, and time entries.
-- Existing rows are auto-assigned to a 'default' profile via column defaults.

CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users access own profiles" ON public.profiles;
CREATE POLICY "Users access own profiles" ON public.profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add profile_id to every data table. DEFAULT 'default' auto-assigns pre-existing rows.
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.tasks        ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.config       ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.settings     ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.timer_state  ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT 'default';

-- Update primary keys on the single-row-per-user tables to include profile_id
-- so each profile can store its own config/settings/timer.
ALTER TABLE public.config       DROP CONSTRAINT IF EXISTS config_pkey;
ALTER TABLE public.config       ADD CONSTRAINT config_pkey PRIMARY KEY (user_id, profile_id);

ALTER TABLE public.settings     DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE public.settings     ADD CONSTRAINT settings_pkey PRIMARY KEY (user_id, profile_id);

ALTER TABLE public.timer_state  DROP CONSTRAINT IF EXISTS timer_state_pkey;
ALTER TABLE public.timer_state  ADD CONSTRAINT timer_state_pkey PRIMARY KEY (user_id, profile_id);

-- Extend compound keys on the per-row tables so the same client-generated id
-- can coexist in multiple profiles without clobbering each other on upsert.
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_pkey;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (user_id, profile_id, id);

ALTER TABLE public.tasks        DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE public.tasks        ADD CONSTRAINT tasks_pkey PRIMARY KEY (user_id, profile_id, id);

-- Indexes to keep profile-scoped filtering fast
CREATE INDEX IF NOT EXISTS idx_entries_user_profile_week
  ON public.time_entries(user_id, profile_id, week_key);
CREATE INDEX IF NOT EXISTS idx_tasks_user_profile
  ON public.tasks(user_id, profile_id);

-- Seed a "Default" profile for every existing user that has any data, so the
-- UI has something to show immediately after the migration.
INSERT INTO public.profiles (id, user_id, name)
SELECT DISTINCT 'default', user_id, 'Default' FROM public.config
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, name)
SELECT DISTINCT 'default', user_id, 'Default' FROM public.time_entries
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, name)
SELECT DISTINCT 'default', user_id, 'Default' FROM public.tasks
ON CONFLICT (user_id, id) DO NOTHING;
