-- Add profile_id to backups so each backup is scoped to a profile.
-- Existing rows get NULL (shown in all profiles for backwards compat).

ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS profile_id TEXT;

CREATE INDEX IF NOT EXISTS idx_backups_user_profile
  ON public.backups(user_id, profile_id, created_at DESC);
