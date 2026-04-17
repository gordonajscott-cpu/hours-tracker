-- Rollback migrations 003 (backups) and 004 (profiles)
-- Run rollback_006.sql and rollback_005.sql FIRST if those were also applied.
-- WARNING: This drops the backups and profiles tables and removes profile_id
-- columns. Existing data in those columns/tables will be lost.

-- ── Rollback 004 (profiles) ──

DROP POLICY IF EXISTS "Users access own profiles" ON public.profiles;

DROP INDEX IF EXISTS idx_entries_user_profile_week;
DROP INDEX IF EXISTS idx_tasks_user_profile;

-- Restore original primary keys (drop composite, re-add single)
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_pkey;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (user_id, id);

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (user_id, id);

ALTER TABLE public.config DROP CONSTRAINT IF EXISTS config_pkey;
ALTER TABLE public.config ADD CONSTRAINT config_pkey PRIMARY KEY (user_id);

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (user_id);

ALTER TABLE public.timer_state DROP CONSTRAINT IF EXISTS timer_state_pkey;
ALTER TABLE public.timer_state ADD CONSTRAINT timer_state_pkey PRIMARY KEY (user_id);

-- Remove profile_id columns
ALTER TABLE public.time_entries DROP COLUMN IF EXISTS profile_id;
ALTER TABLE public.tasks        DROP COLUMN IF EXISTS profile_id;
ALTER TABLE public.config       DROP COLUMN IF EXISTS profile_id;
ALTER TABLE public.settings     DROP COLUMN IF EXISTS profile_id;
ALTER TABLE public.timer_state  DROP COLUMN IF EXISTS profile_id;

DROP TABLE IF EXISTS public.profiles;

-- ── Rollback 003 (backups) ──

DROP POLICY IF EXISTS "Users access own backups" ON public.backups;
DROP INDEX IF EXISTS idx_backups_user_created;
DROP TABLE IF EXISTS public.backups;
