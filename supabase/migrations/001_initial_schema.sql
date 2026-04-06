-- Hours Tracker Database Schema
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run

-- Config (one row per user)
CREATE TABLE public.config (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings (one row per user)
CREATE TABLE public.settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  standard_hours DECIMAL DEFAULT 37.5,
  defaults JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time entries
CREATE TABLE public.time_entries (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_key TEXT NOT NULL,
  day_index SMALLINT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  note TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  project TEXT DEFAULT '',
  work_order TEXT DEFAULT '',
  activity TEXT DEFAULT '',
  role TEXT DEFAULT '',
  bill_rate TEXT DEFAULT '',
  tags JSONB DEFAULT '[]',
  recurring BOOLEAN DEFAULT FALSE,
  recur_frequency TEXT DEFAULT '',
  task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- Tasks
CREATE TABLE public.tasks (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  importance SMALLINT DEFAULT 3,
  due_date DATE,
  status TEXT DEFAULT 'not_started',
  project TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  work_order TEXT DEFAULT '',
  activity TEXT DEFAULT '',
  tags JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  recurring BOOLEAN DEFAULT FALSE,
  recur_frequency TEXT DEFAULT '',
  subtasks JSONB DEFAULT '[]',
  delegated_to TEXT DEFAULT '',
  delegated_follow_up DATE,
  blocked_by TEXT,
  effort_minutes INTEGER DEFAULT 0,
  scheduled_date DATE,
  scheduled_start TEXT DEFAULT '',
  scheduled_end TEXT DEFAULT '',
  do_now BOOLEAN DEFAULT FALSE,
  urgent BOOLEAN DEFAULT FALSE,
  completed_date DATE,
  created_date DATE DEFAULT CURRENT_DATE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

-- Timer state (one row per user)
CREATE TABLE public.timer_state (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  status TEXT DEFAULT 'stopped',
  start_time TIMESTAMPTZ,
  start_str TEXT DEFAULT '',
  elapsed BIGINT DEFAULT 0,
  total_paused BIGINT DEFAULT 0,
  pause_start TEXT,
  note TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  project TEXT DEFAULT '',
  work_order TEXT DEFAULT '',
  activity TEXT DEFAULT '',
  tags JSONB DEFAULT '[]',
  entry_id TEXT
);

-- Indexes
CREATE INDEX idx_entries_user_week ON public.time_entries(user_id, week_key);
CREATE INDEX idx_tasks_user_status ON public.tasks(user_id, status);

-- Row Level Security
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_state ENABLE ROW LEVEL SECURITY;

-- Policies: users can only read/write their own data
CREATE POLICY "Users access own config" ON public.config
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own settings" ON public.settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own entries" ON public.time_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own tasks" ON public.tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own timer" ON public.timer_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
