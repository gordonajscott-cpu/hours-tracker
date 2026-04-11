import { supabase, supabaseConfigured } from './supabase';

// Storage abstraction: uses Supabase when configured, falls back to localStorage.
// All methods are async for consistency.

const KEYS = {
  config: 'wht-v3-config',
  data: 'wht-v3-data',
  settings: 'wht-v3-settings',
  timer: 'wht-v3-timer',
  tasks: 'wht-v3-tasks',
};

// ── localStorage adapter ──

const local = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v ? { value: v } : null;
  },
  async set(key, value) {
    localStorage.setItem(key, value);
  },
};

// ── Supabase adapter ──

function supa(userId) {
  return {
    async get(key) {
      const table = keyToTable(key);
      if (!table) return null;
      if (table === 'time_entries' || table === 'tasks') {
        // These are handled differently — return all rows
        return null;
      }
      const { data } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', userId)
        .single();
      if (!data) return null;
      if (table === 'config') return { value: JSON.stringify(data.data) };
      if (table === 'settings')
        return {
          value: JSON.stringify({
            standardHours: data.standard_hours,
            defaults: data.defaults,
          }),
        };
      if (table === 'timer_state') return { value: JSON.stringify(supaTimerToLocal(data)) };
      return null;
    },
    async set(key, value) {
      const table = keyToTable(key);
      if (!table) return;
      const parsed = JSON.parse(value);
      if (table === 'config') {
        await supabase.from('config').upsert({
          user_id: userId,
          data: parsed,
          updated_at: new Date().toISOString(),
        });
      } else if (table === 'settings') {
        await supabase.from('settings').upsert({
          user_id: userId,
          standard_hours: parsed.standardHours || 37.5,
          defaults: parsed.defaults || {},
          updated_at: new Date().toISOString(),
        });
      } else if (table === 'timer_state') {
        if (!parsed) {
          await supabase.from('timer_state').upsert({
            user_id: userId,
            status: 'stopped',
            start_time: null,
            start_str: '',
            elapsed: 0,
            total_paused: 0,
            pause_start: null,
            note: '',
            customer: '',
            project: '',
            work_order: '',
            activity: '',
            tags: [],
            entry_id: null,
          });
        } else {
          await supabase.from('timer_state').upsert({
            user_id: userId,
            status: parsed.status || 'stopped',
            start_time: parsed.startTime || null,
            start_str: parsed.startStr || '',
            elapsed: 0,
            total_paused: parsed.totalPaused || 0,
            pause_start: parsed.pauseStart || null,
            note: parsed.note || '',
            customer: parsed.customer || '',
            project: parsed.project || '',
            work_order: parsed.workOrder || '',
            activity: parsed.activity || '',
            tags: parsed.tags || [],
            entry_id: parsed.entryId || null,
          });
        }
      }
    },
  };
}

function keyToTable(key) {
  if (key === KEYS.config) return 'config';
  if (key === KEYS.settings) return 'settings';
  if (key === KEYS.timer) return 'timer_state';
  if (key === KEYS.data) return 'time_entries';
  if (key === KEYS.tasks) return 'tasks';
  return null;
}

function supaTimerToLocal(row) {
  if (!row || row.status === 'stopped') return null;
  return {
    status: row.status,
    startTime: row.start_time,
    startStr: row.start_str,
    totalPaused: row.total_paused || 0,
    pauseStart: row.pause_start || null,
    note: row.note || '',
    activity: row.activity || '',
    customer: row.customer || '',
    project: row.project || '',
    workOrder: row.work_order || '',
    tags: row.tags || [],
    entryId: row.entry_id || null,
  };
}

// ── Supabase bulk data operations ──

export async function loadAllData(userId) {
  if (!supabaseConfigured || !userId) return null;
  const { data: rows } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', userId)
    .order('week_key')
    .order('day_index')
    .order('start_time');
  if (!rows) return {};
  const allData = {};
  for (const row of rows) {
    if (!allData[row.week_key]) allData[row.week_key] = [[], [], [], [], [], [], []];
    allData[row.week_key][row.day_index].push({
      id: row.id,
      start: row.start_time,
      end: row.end_time,
      note: row.note || '',
      customer: row.customer || '',
      project: row.project || '',
      workOrder: row.work_order || '',
      activity: row.activity || '',
      role: row.role || '',
      billRate: row.bill_rate || '',
      tags: row.tags || [],
      recurring: row.recurring || false,
      recurFrequency: row.recur_frequency || '',
      taskId: row.task_id || '',
    });
  }
  return allData;
}

export async function saveAllData(userId, allData) {
  if (!supabaseConfigured || !userId) return;
  // Delete all existing entries and re-insert
  await supabase.from('time_entries').delete().eq('user_id', userId);
  const rows = [];
  for (const [weekKey, days] of Object.entries(allData)) {
    for (let di = 0; di < days.length; di++) {
      for (const ent of days[di] || []) {
        rows.push({
          id: ent.id,
          user_id: userId,
          week_key: weekKey,
          day_index: di,
          start_time: ent.start || '',
          end_time: ent.end || '',
          note: ent.note || '',
          customer: ent.customer || '',
          project: ent.project || '',
          work_order: ent.workOrder || '',
          activity: ent.activity || '',
          role: ent.role || '',
          bill_rate: ent.billRate || '',
          tags: ent.tags || [],
          recurring: ent.recurring || false,
          recur_frequency: ent.recurFrequency || '',
          task_id: ent.taskId || null,
        });
      }
    }
  }
  if (rows.length > 0) {
    // Insert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('time_entries').insert(rows.slice(i, i + 500));
    }
  }
}

export async function loadTasks(userId) {
  if (!supabaseConfigured || !userId) return null;
  const { data: rows } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');
  if (!rows) return [];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    importance: r.importance,
    dueDate: r.due_date || '',
    startDate: r.start_date || '',
    doNow: r.do_now || false,
    urgent: r.urgent || false,
    status: r.status || 'not_started',
    project: r.project || '',
    customer: r.customer || '',
    workOrder: r.work_order || '',
    activity: r.activity || '',
    tags: r.tags || [],
    completedDate: r.completed_date || '',
    notes: r.notes || '',
    createdDate: r.created_date || '',
    duration: r.duration || 0,
    recurring: r.recurring || false,
    recurFrequency: r.recur_frequency || '',
    subtasks: r.subtasks || [],
    delegatedTo: r.delegated_to || '',
    delegatedFollowUp: r.delegated_follow_up || '',
    blockedBy: r.blocked_by || '',
    effortMinutes: r.effort_minutes || 0,
    scheduledDate: r.scheduled_date || '',
    scheduledStart: r.scheduled_start || '',
    scheduledEnd: r.scheduled_end || '',
  }));
}

// Build the Postgres row for a task. Dates are coerced to null on empty/invalid
// values to avoid DATE cast errors on import.
function taskToRow(t, i, userId) {
  const toDate = (v) => {
    if (!v || typeof v !== 'string') return null;
    // Accept YYYY-MM-DD (with optional time suffix we strip)
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };
  return {
    id: t.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + i),
    user_id: userId,
    title: t.title || '(untitled)',
    importance: t.importance || 3,
    due_date: toDate(t.dueDate),
    start_date: toDate(t.startDate),
    status: t.status || 'not_started',
    project: t.project || '',
    customer: t.customer || '',
    work_order: t.workOrder || '',
    activity: t.activity || '',
    tags: t.tags || [],
    notes: t.notes || '',
    duration: t.duration || 0,
    recurring: t.recurring || false,
    recur_frequency: t.recurFrequency || '',
    subtasks: t.subtasks || [],
    delegated_to: t.delegatedTo || '',
    delegated_follow_up: toDate(t.delegatedFollowUp),
    blocked_by: t.blockedBy || null,
    effort_minutes: t.effortMinutes || 0,
    scheduled_date: toDate(t.scheduledDate),
    scheduled_start: t.scheduledStart || '',
    scheduled_end: t.scheduledEnd || '',
    do_now: t.doNow || false,
    urgent: t.urgent || false,
    completed_date: toDate(t.completedDate),
    created_date: toDate(t.createdDate),
    sort_order: i,
  };
}

// Columns added by later migrations. If the target DB is on an older schema
// (migration 002 not yet applied), we retry the insert with these columns
// stripped so the rest of the task data still lands.
const OPTIONAL_TASK_COLUMNS = ['start_date'];

function stripOptionalColumns(rows) {
  return rows.map((r) => {
    const copy = { ...r };
    for (const col of OPTIONAL_TASK_COLUMNS) delete copy[col];
    return copy;
  });
}

// PostgREST returns at least two different messages for unknown columns:
//   - "column \"foo\" does not exist"  (direct Postgres error)
//   - "Could not find the 'foo' column of 'tasks' in the schema cache"
// Also catches PGRST204 which is the schema cache variant.
function isMissingColumnError(error) {
  if (!error) return false;
  const msg = (error.message || '') + ' ' + (error.code || '') + ' ' + (error.hint || '');
  return (
    /column .* does not exist/i.test(msg) ||
    /could not find .* column/i.test(msg) ||
    /PGRST204/i.test(msg)
  );
}

export async function saveTasks(userId, tasks) {
  if (!supabaseConfigured || !userId) return;
  const { error: delErr } = await supabase.from('tasks').delete().eq('user_id', userId);
  if (delErr) throw new Error(`saveTasks delete failed: ${delErr.message}`);
  const rows = tasks.map((t, i) => taskToRow(t, i, userId));
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    let { error } = await supabase.from('tasks').insert(chunk);
    if (isMissingColumnError(error)) {
      // Retry without columns from later migrations
      ({ error } = await supabase.from('tasks').insert(stripOptionalColumns(chunk)));
    }
    if (error) throw new Error(`saveTasks insert failed: ${error.message}`);
  }
}

// Non-destructive import: upsert so existing tasks aren't wiped if the batch
// fails partway, and surfaces errors instead of swallowing them.
export async function importTasks(userId, tasks) {
  if (!supabaseConfigured || !userId) {
    throw new Error('Supabase not configured or user not signed in');
  }
  if (!Array.isArray(tasks) || tasks.length === 0) return { inserted: 0 };
  let rows = tasks.map((t, i) => taskToRow(t, i, userId));

  // Probe once up-front: if the DB is on an older schema and is missing an
  // optional column, strip it from every row before we start batching.
  // (upsert is idempotent so re-processing row 0 in the main loop is fine.)
  const probe = await supabase
    .from('tasks')
    .upsert([rows[0]], { onConflict: 'user_id,id' });
  if (isMissingColumnError(probe.error)) {
    rows = stripOptionalColumns(rows);
  }

  let inserted = 0;
  const failures = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    let { error } = await supabase
      .from('tasks')
      .upsert(chunk, { onConflict: 'user_id,id' });
    if (isMissingColumnError(error)) {
      ({ error } = await supabase
        .from('tasks')
        .upsert(stripOptionalColumns(chunk), { onConflict: 'user_id,id' }));
    }
    if (error) {
      // Fall back to one-by-one so a single bad row doesn't kill the whole batch
      for (const row of chunk) {
        let r = await supabase
          .from('tasks')
          .upsert([row], { onConflict: 'user_id,id' });
        if (isMissingColumnError(r.error)) {
          r = await supabase
            .from('tasks')
            .upsert(stripOptionalColumns([row]), { onConflict: 'user_id,id' });
        }
        if (r.error) {
          failures.push({ id: row.id, title: row.title, error: r.error.message });
        } else {
          inserted += 1;
        }
      }
    } else {
      inserted += chunk.length;
    }
  }
  if (failures.length > 0) {
    const sample = failures.slice(0, 3).map((f) => `"${f.title}": ${f.error}`).join('; ');
    throw new Error(
      `Imported ${inserted}/${rows.length} tasks. ${failures.length} failed. First errors: ${sample}`,
    );
  }
  return { inserted };
}

// ── Public API ──

export function getStorage(userId) {
  if (supabaseConfigured && userId) {
    return supa(userId);
  }
  return local;
}
