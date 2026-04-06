-- Hours Tracker Database Schema

CREATE TABLE config (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  standard_hours DECIMAL DEFAULT 37.5,
  defaults JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE time_entries (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  week_key TEXT NOT NULL,
  day_index SMALLINT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
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

CREATE TABLE tasks (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
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
  scheduled_start TEXT,
  scheduled_end TEXT,
  do_now BOOLEAN DEFAULT FALSE,
  urgent BOOLEAN DEFAULT FALSE,
  completed_date DATE,
  created_date DATE DEFAULT CURRENT_DATE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE timer_state (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
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
CREATE INDEX idx_entries_user_week ON time_entries(user_id, week_key);
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);

-- Row Level Security
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE timer_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own config" ON config FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own settings" ON settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own entries" ON time_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own tasks" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own timer" ON timer_state FOR ALL USING (auth.uid() = user_id);
