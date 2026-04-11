-- Automatic backups table: stores periodic snapshots of a user's full state
-- (time entries, config, settings, tasks) as a single JSONB payload. Used for
-- the in-app "Automatic Backups" feature — rotated to the last N per user.

CREATE TABLE IF NOT EXISTS public.backups (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  label TEXT DEFAULT '',
  size_bytes INTEGER DEFAULT 0,
  data JSONB NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_backups_user_created
  ON public.backups(user_id, created_at DESC);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own backups" ON public.backups;
CREATE POLICY "Users access own backups" ON public.backups
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
