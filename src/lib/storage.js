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
//
// When `profileId` is falsy the adapter behaves exactly as before the profiles
// feature existed — no profile_id column is read or written. When `profileId`
// is set, every query is scoped to (user_id, profile_id) and the upsert target
// uses the composite key.

function supa(userId, profileId = null) {
  return {
    async get(key) {
      const table = keyToTable(key);
      if (!table) return null;
      if (table === 'time_entries' || table === 'tasks') {
        // These are handled differently — return all rows
        return null;
      }
      let q = supabase.from(table).select('*').eq('user_id', userId);
      if (profileId) q = q.eq('profile_id', profileId);
      const { data } = await q.maybeSingle();
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
      const onConflict = profileId ? 'user_id,profile_id' : 'user_id';
      const withProfile = (row) => (profileId ? { ...row, profile_id: profileId } : row);
      let result;
      if (table === 'config') {
        result = await supabase.from('config').upsert(
          withProfile({
            user_id: userId,
            data: parsed,
            updated_at: new Date().toISOString(),
          }),
          { onConflict },
        );
      } else if (table === 'settings') {
        result = await supabase.from('settings').upsert(
          withProfile({
            user_id: userId,
            standard_hours: parsed.standardHours || 37.5,
            defaults: parsed.defaults || {},
            updated_at: new Date().toISOString(),
          }),
          { onConflict },
        );
      } else if (table === 'timer_state') {
        if (!parsed) {
          result = await supabase.from('timer_state').upsert(
            withProfile({
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
            }),
            { onConflict },
          );
        } else {
          result = await supabase.from('timer_state').upsert(
            withProfile({
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
            }),
            { onConflict },
          );
        }
      }
      if (result?.error) throw new Error(`storage.set(${key}) failed: ${result.error.message}`);
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

export async function loadAllData(userId, profileId = null) {
  if (!supabaseConfigured || !userId) return null;
  let q = supabase.from('time_entries').select('*').eq('user_id', userId);
  if (profileId) q = q.eq('profile_id', profileId);
  const { data: rows } = await q
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

export async function saveAllData(userId, allData, profileId = null) {
  if (!supabaseConfigured || !userId) return;
  let delQ = supabase.from('time_entries').delete().eq('user_id', userId);
  if (profileId) delQ = delQ.eq('profile_id', profileId);
  const { error: delError } = await delQ;
  if (delError) throw new Error(`saveAllData delete failed: ${delError.message}`);
  const rows = [];
  for (const [weekKey, days] of Object.entries(allData)) {
    for (let di = 0; di < days.length; di++) {
      for (const ent of days[di] || []) {
        const row = {
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
        };
        if (profileId) row.profile_id = profileId;
        rows.push(row);
      }
    }
  }
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insError } = await supabase.from('time_entries').insert(rows.slice(i, i + 500));
      if (insError) throw new Error(`saveAllData insert failed: ${insError.message}`);
    }
  }
}

export async function loadTasks(userId, profileId = null) {
  if (!supabaseConfigured || !userId) return null;
  let q = supabase.from('tasks').select('*').eq('user_id', userId);
  if (profileId) q = q.eq('profile_id', profileId);
  const { data: rows } = await q.order('sort_order');
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
function taskToRow(t, i, userId, profileId = null) {
  const toDate = (v) => {
    if (!v || typeof v !== 'string') return null;
    // Accept YYYY-MM-DD (with optional time suffix we strip)
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };
  const row = {
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
  if (profileId) row.profile_id = profileId;
  return row;
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

export async function saveTasks(userId, tasks, profileId = null) {
  if (!supabaseConfigured || !userId) return;
  let delQ = supabase.from('tasks').delete().eq('user_id', userId);
  if (profileId) delQ = delQ.eq('profile_id', profileId);
  const { error: delErr } = await delQ;
  if (delErr) throw new Error(`saveTasks delete failed: ${delErr.message}`);
  const rows = tasks.map((t, i) => taskToRow(t, i, userId, profileId));
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
export async function importTasks(userId, tasks, profileId = null) {
  if (!supabaseConfigured || !userId) {
    throw new Error('Supabase not configured or user not signed in');
  }
  if (!Array.isArray(tasks) || tasks.length === 0) return { inserted: 0 };
  let rows = tasks.map((t, i) => taskToRow(t, i, userId, profileId));

  const onConflict = profileId ? 'user_id,profile_id,id' : 'user_id,id';

  // Probe once up-front: if the DB is on an older schema and is missing an
  // optional column, strip it from every row before we start batching.
  // (upsert is idempotent so re-processing row 0 in the main loop is fine.)
  const probe = await supabase.from('tasks').upsert([rows[0]], { onConflict });
  if (isMissingColumnError(probe.error)) {
    rows = stripOptionalColumns(rows);
  }

  let inserted = 0;
  const failures = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    let { error } = await supabase.from('tasks').upsert(chunk, { onConflict });
    if (isMissingColumnError(error)) {
      ({ error } = await supabase
        .from('tasks')
        .upsert(stripOptionalColumns(chunk), { onConflict }));
    }
    if (error) {
      // Fall back to one-by-one so a single bad row doesn't kill the whole batch
      for (const row of chunk) {
        let r = await supabase.from('tasks').upsert([row], { onConflict });
        if (isMissingColumnError(r.error)) {
          r = await supabase
            .from('tasks')
            .upsert(stripOptionalColumns([row]), { onConflict });
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

// ── Backups (automatic snapshots) ──

// Error thrown when the backups table hasn't been created yet. UI uses this
// to show the migration instructions instead of a generic error.
export class BackupsTableMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupsTableMissingError';
  }
}

function isMissingTableError(error) {
  if (!error) return false;
  const msg = (error.message || '') + ' ' + (error.code || '') + ' ' + (error.hint || '');
  return (
    /relation .* does not exist/i.test(msg) ||
    /could not find the table/i.test(msg) ||
    /PGRST205/i.test(msg)
  );
}

function backupId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function createBackup(userId, label, snapshot) {
  if (!supabaseConfigured || !userId) {
    throw new Error('Supabase not configured or user not signed in');
  }
  const json = JSON.stringify(snapshot);
  const row = {
    id: backupId(),
    user_id: userId,
    label: label || 'auto',
    data: snapshot,
    size_bytes: json.length,
  };
  const { error } = await supabase.from('backups').insert(row);
  if (isMissingTableError(error)) {
    throw new BackupsTableMissingError(
      'Backups table does not exist. Run migration 003_add_backups_table.sql in Supabase.',
    );
  }
  if (error) throw new Error(`createBackup failed: ${error.message}`);
  return { id: row.id, created_at: new Date().toISOString(), label: row.label, size_bytes: row.size_bytes };
}

export async function listBackups(userId) {
  if (!supabaseConfigured || !userId) return [];
  const { data, error } = await supabase
    .from('backups')
    .select('id, created_at, label, size_bytes')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (isMissingTableError(error)) {
    throw new BackupsTableMissingError(
      'Backups table does not exist. Run migration 003_add_backups_table.sql in Supabase.',
    );
  }
  if (error) throw new Error(`listBackups failed: ${error.message}`);
  return data || [];
}

export async function getBackup(userId, id) {
  if (!supabaseConfigured || !userId) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('backups')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .single();
  if (error) throw new Error(`getBackup failed: ${error.message}`);
  return data;
}

export async function deleteBackup(userId, id) {
  if (!supabaseConfigured || !userId) return;
  const { error } = await supabase
    .from('backups')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw new Error(`deleteBackup failed: ${error.message}`);
}

// Keep the most recent `keepCount` backups, delete the rest.
export async function pruneBackups(userId, keepCount = 14) {
  if (!supabaseConfigured || !userId) return;
  const { data, error } = await supabase
    .from('backups')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return;
  const toDelete = data.slice(keepCount).map((r) => r.id);
  if (toDelete.length === 0) return;
  await supabase.from('backups').delete().eq('user_id', userId).in('id', toDelete);
}

// ── Profiles (multi-profile support) ──
//
// A profile is a named bucket of (config, settings, tasks, time entries, timer).
// Every query is scoped to (user_id, profile_id). The feature requires
// migration 004_add_profiles.sql; functions here return null (or throw
// ProfilesTableMissingError) when the table doesn't exist yet.

export class ProfilesTableMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProfilesTableMissingError';
  }
}

// Returns the list of profiles for the user, or null if the feature isn't
// enabled yet (migration 004 not run). Never throws for the missing-table
// case so callers can distinguish "not set up" from real errors.
export async function listProfiles(userId) {
  if (!supabaseConfigured || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at');
  if (isMissingTableError(error)) return null;
  if (error) throw new Error(`listProfiles failed: ${error.message}`);
  return data || [];
}

// Ensures a "Default" profile exists for the user if they don't have one yet.
// Returns the full list after any seeding. Null means the profiles table
// doesn't exist — migration 004 needs to be run.
export async function ensureDefaultProfile(userId) {
  const existing = await listProfiles(userId);
  if (existing === null) return null;
  if (existing.length > 0) return existing;
  const { error } = await supabase
    .from('profiles')
    .insert({ id: 'default', user_id: userId, name: 'Default' });
  if (error && !/duplicate key/i.test(error.message)) {
    throw new Error(`ensureDefaultProfile failed: ${error.message}`);
  }
  return [{ id: 'default', user_id: userId, name: 'Default' }];
}

export async function createProfile(userId, id, name, category = 'work') {
  if (!supabaseConfigured || !userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .insert({ id, user_id: userId, name, category });
  if (isMissingTableError(error)) {
    throw new ProfilesTableMissingError(
      'Profiles table does not exist. Run migration 004_add_profiles.sql in Supabase.',
    );
  }
  if (error) throw new Error(`createProfile failed: ${error.message}`);
  return { id, user_id: userId, name, category };
}

export async function updateProfileCategory(userId, id, category) {
  if (!supabaseConfigured || !userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update({ category })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw new Error(`updateProfileCategory failed: ${error.message}`);
}

export async function renameProfile(userId, id, name) {
  if (!supabaseConfigured || !userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update({ name })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw new Error(`renameProfile failed: ${error.message}`);
}

// Deletes the profile and all data rows tagged with its id. Cascaded manually
// across the data tables since there is no FK from those tables to profiles.
export async function deleteProfile(userId, id) {
  if (!supabaseConfigured || !userId) throw new Error('Not signed in');
  if (id === 'default') {
    throw new Error('The default profile cannot be deleted.');
  }
  for (const table of ['time_entries', 'tasks', 'config', 'settings', 'timer_state']) {
    await supabase.from(table).delete().eq('user_id', userId).eq('profile_id', id);
  }
  const { error } = await supabase.from('profiles').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(`deleteProfile failed: ${error.message}`);
}

// ── Organizations ──

export async function createOrg(name) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('create_organization', { org_name: name });
  if (error) throw new Error(`createOrg failed: ${error.message}`);
  return data;
}

export async function joinOrg(inviteCode) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('join_org_by_invite', { code: inviteCode });
  if (error) throw new Error(`joinOrg failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getMyOrg(userId) {
  if (!supabaseConfigured || !userId) return null;
  const { data, error } = await supabase
    .from('organization_members')
    .select('org_id, role, joined_at, organizations(id, name, invite_code, created_at)')
    .eq('user_id', userId);
  if (isMissingTableError(error)) return null;
  if (error) { console.error("getMyOrg query failed:", error.message); return null; }
  if (!data || data.length === 0) return null;
  return data[0];
}

export async function getOrgMembers(orgId) {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id, role, display_name, joined_at')
    .eq('org_id', orgId)
    .order('joined_at');
  if (error) throw new Error(`getOrgMembers failed: ${error.message}`);
  return data || [];
}

export async function updateMemberRole(orgId, targetUserId, role) {
  const { error } = await supabase
    .from('organization_members')
    .update({ role })
    .eq('org_id', orgId)
    .eq('user_id', targetUserId);
  if (error) throw new Error(`updateMemberRole failed: ${error.message}`);
}

export async function removeMember(orgId, targetUserId) {
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', targetUserId);
  if (error) throw new Error(`removeMember failed: ${error.message}`);
}

export async function updateMyDisplayName(orgId, userId, displayName) {
  const { error } = await supabase
    .from('organization_members')
    .update({ display_name: displayName })
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) throw new Error(`updateMyDisplayName failed: ${error.message}`);
}

export async function regenerateInviteCode(orgId) {
  const code = Math.random().toString(36).slice(2, 10);
  const { error } = await supabase
    .from('organizations')
    .update({ invite_code: code })
    .eq('id', orgId);
  if (error) throw new Error(`regenerateInviteCode failed: ${error.message}`);
  return code;
}

export async function loadOrgConfig(orgId) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('org_config')
    .select('data')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return null;
  return data?.data || {};
}

export async function saveOrgConfig(orgId, configData) {
  const { error } = await supabase
    .from('org_config')
    .upsert({
      org_id: orgId,
      data: configData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' });
  if (error) throw new Error(`saveOrgConfig failed: ${error.message}`);
}

export async function linkProfileToOrg(userId, profileId, orgId) {
  const { error } = await supabase
    .from('profiles')
    .update({ organization_id: orgId })
    .eq('user_id', userId)
    .eq('id', profileId);
  if (error) throw new Error(`linkProfileToOrg failed: ${error.message}`);
}

export async function unlinkProfileFromOrg(userId, profileId) {
  const { error } = await supabase
    .from('profiles')
    .update({ organization_id: null })
    .eq('user_id', userId)
    .eq('id', profileId);
  if (error) throw new Error(`unlinkProfileFromOrg failed: ${error.message}`);
}

export async function leaveOrg(orgId, userId) {
  await supabase
    .from('profiles')
    .update({ organization_id: null })
    .eq('user_id', userId)
    .not('organization_id', 'is', null);
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) throw new Error(`leaveOrg failed: ${error.message}`);
}

// ── Portfolios ──

export async function createPortfolio(orgId, name) {
  const { data, error } = await supabase
    .from('portfolios')
    .insert({ org_id: orgId, name })
    .select()
    .single();
  if (error) throw new Error(`createPortfolio failed: ${error.message}`);
  return data;
}

export async function listOrgPortfolios(orgId) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at');
  if (isMissingTableError(error)) return null;
  if (error) return null;
  return data || [];
}

export async function deletePortfolio(portfolioId) {
  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', portfolioId);
  if (error) throw new Error(`deletePortfolio failed: ${error.message}`);
}

export async function renamePortfolio(portfolioId, name) {
  const { error } = await supabase
    .from('portfolios')
    .update({ name })
    .eq('id', portfolioId);
  if (error) throw new Error(`renamePortfolio failed: ${error.message}`);
}

export async function addPortfolioMember(portfolioId, userId, role = 'member') {
  const { error } = await supabase
    .from('portfolio_members')
    .upsert(
      { portfolio_id: portfolioId, user_id: userId, role },
      { onConflict: 'portfolio_id,user_id' },
    );
  if (error) throw new Error(`addPortfolioMember failed: ${error.message}`);
}

export async function removePortfolioMember(portfolioId, userId) {
  const { error } = await supabase
    .from('portfolio_members')
    .delete()
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId);
  if (error) throw new Error(`removePortfolioMember failed: ${error.message}`);
}

export async function getPortfolioMembers(portfolioId) {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('portfolio_members')
    .select('user_id, role')
    .eq('portfolio_id', portfolioId);
  if (error) throw new Error(`getPortfolioMembers failed: ${error.message}`);
  return data || [];
}

export async function updatePortfolioMemberRole(portfolioId, userId, role) {
  const { error } = await supabase
    .from('portfolio_members')
    .update({ role })
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId);
  if (error) throw new Error(`updatePortfolioMemberRole failed: ${error.message}`);
}

export async function getMyPortfolios(userId) {
  if (!supabaseConfigured || !userId) return null;
  const { data, error } = await supabase
    .from('portfolio_members')
    .select('portfolio_id, role, portfolios(id, name, org_id)')
    .eq('user_id', userId);
  if (isMissingTableError(error)) return null;
  if (error) return null;
  return data || [];
}

export async function loadPortfolioEntries(memberUserIds, weekKey) {
  if (!supabaseConfigured || memberUserIds.length === 0) return [];
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .in('user_id', memberUserIds)
    .eq('week_key', weekKey)
    .order('user_id')
    .order('day_index')
    .order('start_time');
  if (error) throw new Error(`loadPortfolioEntries failed: ${error.message}`);
  return data || [];
}

export async function loadPortfolioTasks(memberUserIds) {
  if (!supabaseConfigured || memberUserIds.length === 0) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .in('user_id', memberUserIds)
    .order('user_id')
    .order('sort_order');
  if (error) throw new Error(`loadPortfolioTasks failed: ${error.message}`);
  return data || [];
}

// ── Public API ──

export function getStorage(userId, profileId = null) {
  if (supabaseConfigured && userId) {
    return supa(userId, profileId);
  }
  return local;
}
