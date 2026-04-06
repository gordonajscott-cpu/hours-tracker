# Hours Tracker — Web App Project Brief

## Overview

Migrate a fully-featured work hours tracker from a single-file React artifact (8,000+ lines, `window.storage` persistence) to a deployable web application with cloud hosting, authentication, and database storage — accessible from any device.

**Owner:** Gordon, Project Manager — NHS health programme in England, managing five health board projects plus central programme work.

---

## Current State

### Tech Stack
- Single React JSX component (~8,050 lines)
- No build system, no routing, no backend
- Persistence via `window.storage` API (Claude artifact-scoped key-value store)
- Storage keys: `wht-v3-config`, `wht-v3-data`, `wht-v3-settings`, `wht-v3-timer`, `wht-v3-tasks`

### Data Model

**Time Entries** (`wht-v3-data`)
Stored as `{ "YYYY-WNN": [ [day0entries], [day1entries], ..., [day6entries] ] }`

Each entry:
```json
{
  "id": "uid",
  "start": "09:00",
  "end": "10:30",
  "note": "Board meeting",
  "customer": "NHS Highland",
  "project": "Digital Transformation",
  "workOrder": "DT-2026-001",
  "activity": "Meeting",
  "role": "",
  "billRate": "",
  "tags": ["productive", "governance"],
  "recurring": false,
  "recurFrequency": "",
  "taskId": ""
}
```

**Tasks** (`wht-v3-tasks`)
Array of task objects:
```json
{
  "id": "uid",
  "title": "Prepare board paper",
  "importance": 4,
  "dueDate": "2026-04-10",
  "doNow": false,
  "urgent": false,
  "status": "in_progress",
  "project": "Digital Transformation",
  "customer": "NHS Highland",
  "workOrder": "DT-2026-001",
  "activity": "Document Preparation",
  "tags": ["governance"],
  "completedDate": "",
  "notes": "https://sharepoint.nhs.uk/doc/123",
  "createdDate": "2026-03-15",
  "duration": 120,
  "recurring": false,
  "recurFrequency": "",
  "subtasks": [
    { "id": "uid", "title": "Draft executive summary", "done": true },
    { "id": "uid", "title": "Compile appendices", "done": false }
  ],
  "delegatedTo": "Sarah",
  "delegatedFollowUp": "2026-04-08",
  "blockedBy": "task-id-xyz",
  "effortMinutes": 0,
  "scheduledDate": "",
  "scheduledStart": "",
  "scheduledEnd": ""
}
```

Task statuses: `not_started`, `in_progress`, `on_hold`, `waiting`, `completed`, `cancelled`

**Config** (`wht-v3-config`)
```json
{
  "customers": [{ "name": "NHS Highland", "code": "NHH", "favourite": true }],
  "projects": [{ "name": "Digital Transformation", "code": "DT", "customer": "NHS Highland", "activityTemplate": "Standard", "favourite": true }],
  "workOrders": [{ "name": "DT-2026-001", "code": "001", "project": "Digital Transformation", "favourite": false }],
  "activities": ["Meeting", "Document Preparation", "Admin"],
  "tags": ["productive", "governance", "admin", "travel"],
  "activityTemplates": [{ "name": "Standard", "activities": ["Meeting", "Document Preparation", "Review"] }],
  "favouriteActivities": ["Meeting"],
  "favouriteTags": ["productive"],
  "tagCategories": { "productive": "good", "admin": "bad", "governance": "good" },
  "roles": [],
  "billRates": [],
  "bankHolidayRegion": "england-and-wales",
  "customHolidays": {},
  "showDailyQuote": true,
  "taskTemplates": [{ "title": "Board Meeting Prep", "importance": 4, "duration": 120, "project": "", "activity": "Document Preparation", "tags": ["governance"], "subtasks": [{ "title": "Draft agenda", "done": false }] }]
}
```

**Settings** (`wht-v3-settings`)
```json
{
  "standardHours": "37.5",
  "defaults": {
    "customer": "",
    "project": "",
    "workOrder": "",
    "activity": "",
    "role": "",
    "startTime": "08:30",
    "endTime": "17:00"
  }
}
```

**Timer** (`wht-v3-timer`)
```json
{
  "status": "running",
  "startTime": "2026-04-06T09:00:00Z",
  "startStr": "09:00",
  "elapsed": 3600000,
  "totalPaused": 0,
  "note": "Working on report",
  "customer": "NHS Highland",
  "project": "Digital Transformation",
  "workOrder": "",
  "activity": "Document Preparation",
  "tags": ["productive"]
}
```

---

## Feature Set (complete)

### Calendar / Time Tracking
- Full 24h calendar with day/week view toggle
- 15-minute snap grid, click-to-create, drag-to-resize, drag-to-move
- Overlap prevention on all operations
- Copy/paste entries (Ctrl+C/V)
- Recurring entries with daily/weekly/biweekly/monthly frequency
- Live "now" line (red, updates every 30s)
- Bank holiday indicators with region presets (England & Wales 2025-2027)
- Work day boundary lines (configurable start/end times)
- Adaptive default scroll based on current time

### Timer
- Persistent timer with running/paused/stopped states
- Fields: note (with autocomplete), customer, project, work order, activity, tags
- Timer block appears live on calendar
- Start timer from selected calendar entry (fills all fields, removes planned block)
- Timer persistence across page loads via storage

### Task Management
- **List view** — compact cards with inline editing, search, filters (status/duration), sort (priority/due/title/manual), group by (project/customer/work order)
- **Kanban board** — dynamic columns by status/priority/due date/importance/project/customer/work order, drag-and-drop between columns
- **My Day** — daily planning with Frog task, Top 3, recommended schedule
- **Schedule** — drag-and-drop tasks onto a full calendar with filters
- **Plan Week** — 5-day grid with drag-and-drop task assignment
- **Task Reports** — metrics, capacity, period reports
- **Review Mode** — one-at-a-time card review with filter options (all/overdue/on hold/no due date/no duration)

### Task Features
- Urgency system: 🔥 Now (exclusive), ⚠️ Urgent, Today, Tomorrow, This week, Next week, This month, Anytime
- Priority score = urgency × importance (1-5 stars)
- Subtasks/checklists with progress bar
- Delegation tracking (name + follow-up date)
- Dependencies (blocked by another task)
- Effort vs estimate tracking on completion
- Task ageing indicator (14+ days orange, 30+ days red)
- Task templates (save and one-click create)
- Batch operations (multi-select + bulk status/project/due date/complete/delete)
- Drag-to-reorder in manual sort mode
- "Waiting For" status (distinct from On Hold)
- Clickable URLs in supporting notes
- Cancelled tasks section with reopen/delete

### Dashboard
- 6 stat cards: Tracked Today, Week Total, Overtime, Due Today, Overdue, Done This Week
- Time Quality bar (productive/unclassified/overhead using tag categories)
- Today's Schedule mini calendar
- Top Priority Tasks with delegation/blocked indicators
- Alert badges (overdue, blocked, delegated)
- Unaccounted Time chart (Mon-Fri tracked vs expected)

### Reports
- Period views: Daily, Weekly, Monthly, Annual, Batch, Comparison
- Group-by and filter-by with sub-group breakdown
- Time Quality stacked bar (good/bad/neutral tags)
- Batch report: Project → Work Order → Activity hierarchy with day columns
- Comparison report: week-over-week or month-over-month stacked bar chart with trend arrows
- CSV export

### Admin Panel
- **Work Structure**: Customers, Projects (with activity template + customer assignment), Work Orders (with project assignment) — all with reorder (▲/▼ + drag), favourites, edit, delete confirmation
- **Activities & Classification**: Activity Templates, Default Activities, Tags (with good/bad/neutral categories) — all with reorder + favourites
- **Rates & Roles**: Roles, Bill Rates — with reorder + favourites
- **Bank Holidays**: Region selector with pre-loaded dates + custom holidays
- **Defaults & Settings**: Contracted hours, work day times, default fields, daily quote toggle
- **Data Management**: Export/Import backup (JSON), CSV export, Sync

### UX Features
- Daily inspirational quote banner (31 quotes, Next/Close, admin toggle)
- Dark mode toggle (🌙/☀️)
- Undo system (Ctrl+Z, 10-action stack, 6-second toast)
- Keyboard shortcuts overlay (⌨️ in footer)
- Note autocomplete from history
- Copy/paste system for time entries
- Tab close warning when timer running
- Mobile responsive CSS (media queries for <768px)

---

## Target Architecture

### Recommended Stack
```
Frontend:  Vite + React (or Next.js)
Backend:   Supabase (Auth + PostgreSQL + Realtime)
Hosting:   Vercel (free tier)
```

### Database Schema (Supabase/PostgreSQL)

```sql
-- Users (handled by Supabase Auth)

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  week_key TEXT NOT NULL,          -- "2026-W14"
  day_index SMALLINT NOT NULL,     -- 0=Mon, 6=Sun
  start_time TEXT NOT NULL,        -- "09:00"
  end_time TEXT NOT NULL,          -- "10:30"
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
  task_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  blocked_by UUID,
  effort_minutes INTEGER DEFAULT 0,
  scheduled_date DATE,
  scheduled_start TEXT,
  scheduled_end TEXT,
  do_now BOOLEAN DEFAULT FALSE,
  urgent BOOLEAN DEFAULT FALSE,
  completed_date DATE,
  created_date DATE DEFAULT CURRENT_DATE,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE timer_state (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  status TEXT DEFAULT 'stopped',
  start_time TIMESTAMPTZ,
  start_str TEXT DEFAULT '',
  elapsed BIGINT DEFAULT 0,
  total_paused BIGINT DEFAULT 0,
  note TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  project TEXT DEFAULT '',
  work_order TEXT DEFAULT '',
  activity TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'
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

CREATE POLICY "Users can only access own data" ON config FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own data" ON settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own data" ON time_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own data" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own data" ON timer_state FOR ALL USING (auth.uid() = user_id);
```

### Project Structure
```
hours-tracker/
├── src/
│   ├── components/
│   │   ├── calendar/
│   │   │   ├── DayCalendar.jsx
│   │   │   ├── WeekView.jsx
│   │   │   └── EntryEditPanel.jsx
│   │   ├── tasks/
│   │   │   ├── TaskList.jsx
│   │   │   ├── TaskCard.jsx
│   │   │   ├── TaskEdit.jsx
│   │   │   ├── KanbanBoard.jsx
│   │   │   ├── ScheduleView.jsx
│   │   │   ├── PlanWeek.jsx
│   │   │   ├── MyDay.jsx
│   │   │   └── ReviewMode.jsx
│   │   ├── dashboard/
│   │   │   └── Dashboard.jsx
│   │   ├── reports/
│   │   │   ├── ReportsTab.jsx
│   │   │   ├── ComparisonReport.jsx
│   │   │   └── BatchReport.jsx
│   │   ├── admin/
│   │   │   ├── AdminPanel.jsx
│   │   │   ├── AdminList.jsx
│   │   │   ├── AdminCodeList.jsx
│   │   │   ├── ProjectEditor.jsx
│   │   │   └── WorkOrderEditor.jsx
│   │   ├── timer/
│   │   │   └── Timer.jsx
│   │   └── shared/
│   │       ├── FavSel.jsx
│   │       ├── TimeSel.jsx
│   │       ├── TagMultiSelect.jsx
│   │       ├── NoteAutoComplete.jsx
│   │       └── LinkText.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useStorage.js        ← abstraction layer
│   │   ├── useTimer.js
│   │   └── useTasks.js
│   ├── lib/
│   │   ├── supabase.js          ← Supabase client
│   │   ├── storage.js           ← storage adapter (swap window.storage ↔ Supabase)
│   │   ├── dates.js             ← date utilities
│   │   ├── urgency.js           ← task urgency calculations
│   │   └── constants.js         ← BLOCK_COLORS, DAILY_QUOTES, BANK_HOLIDAYS, etc.
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── public/
├── package.json
├── vite.config.js
└── .env.local                   ← VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

### Storage Abstraction Layer

The key migration strategy: create a `useStorage` hook that wraps all data access. Initially it can use localStorage for offline dev, then swap to Supabase.

```javascript
// src/lib/storage.js
import { supabase } from './supabase';

export const storage = {
  async getConfig(userId) {
    const { data } = await supabase
      .from('config')
      .select('data')
      .eq('user_id', userId)
      .single();
    return data?.data || {};
  },

  async setConfig(userId, config) {
    await supabase
      .from('config')
      .upsert({ user_id: userId, data: config, updated_at: new Date() });
  },

  async getWeekEntries(userId, weekKey) {
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('week_key', weekKey)
      .order('day_index')
      .order('start_time');
    return data || [];
  },

  // ... etc
};
```

---

## Migration Steps

### Phase 1: Project Setup
1. Scaffold Vite + React project
2. Install dependencies: `@supabase/supabase-js`, `react-router-dom`
3. Set up Supabase project (free tier)
4. Run database migration SQL
5. Configure environment variables

### Phase 2: Component Extraction
1. Extract constants, utilities, and date functions to `lib/`
2. Extract reusable UI components (FavSel, TimeSel, TagMultiSelect, etc.) to `shared/`
3. Extract each major section (Calendar, Tasks, Dashboard, Reports, Admin) into separate component files
4. Create the storage abstraction layer

### Phase 3: Auth + Database
1. Add Supabase Auth (email/password login)
2. Create login/signup page
3. Replace all `window.storage.get/set` calls with Supabase queries via the storage layer
4. Add auto-save with debounce (already exists, just rewire)
5. Test data round-trip

### Phase 4: Deploy
1. Push to GitHub
2. Connect to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy and test on mobile

### Phase 5: Polish
1. Add PWA manifest for "Add to Home Screen" on mobile
2. Add offline support with service worker (optional)
3. Add real-time sync across devices via Supabase Realtime (optional)

---

## Import Existing Data

To migrate data from the current artifact:

1. Open V-Active in Claude
2. Go to Admin → Data Management → Export Backup
3. This produces a JSON blob containing all data
4. In the new web app, build an import page that:
   - Accepts the JSON
   - Parses it into the new database schema
   - Inserts rows into Supabase

The JSON export format matches the storage keys documented above.

---

## Key Decisions to Make

1. **Auth provider** — Supabase Auth (simplest), Clerk (polished UI), or Auth0?
2. **Offline support** — Do you need to track time without internet? If yes, add localStorage cache + sync queue.
3. **Multi-user** — Just you, or could colleagues use it too? Affects RLS policies and sharing.
4. **Mobile** — PWA (web app on home screen) or native app? PWA is much less work.
5. **Domain** — Custom domain (e.g. hours.gordon.dev) or Vercel subdomain (hours-tracker.vercel.app)?

---

## Source File

The complete current codebase is in `work-hours-tracker-v3.jsx` (8,050 lines). Upload this file alongside this brief when starting work in Claude Code or a Claude Project.
