import { useState, useRef } from 'react';
import { useAuth } from './lib/AuthContext';
import { supabaseConfigured } from './lib/supabase';
import { getStorage, saveAllData, saveTasks } from './lib/storage';

export default function ImportData({ onDone }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [status, setStatus] = useState('idle'); // idle, parsing, importing, done, error
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [rawJson, setRawJson] = useState(null);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        setRawJson(parsed);
        setPreview(summarize(parsed));
        setStatus('idle');
      } catch {
        setError('Invalid JSON file. Please select a valid backup export.');
        setStatus('error');
      }
    };
    reader.readAsText(file);
  }

  function handlePaste(text) {
    setError('');
    try {
      const parsed = JSON.parse(text);
      setRawJson(parsed);
      setPreview(summarize(parsed));
      setStatus('idle');
    } catch {
      setError('Invalid JSON. Please paste a valid backup export.');
      setStatus('error');
    }
  }

  function summarize(data) {
    const s = {};
    // Time entries (wht-v3-data or nested under "data")
    const timeData = data['wht-v3-data'] || data.data || null;
    if (timeData && typeof timeData === 'object') {
      const weeks = Object.keys(timeData);
      let entries = 0;
      for (const w of weeks) {
        const days = timeData[w] || [];
        for (const d of days) entries += (d || []).length;
      }
      s.weeks = weeks.length;
      s.entries = entries;
    }
    // Config
    const cfg = data['wht-v3-config'] || data.config || null;
    if (cfg) {
      s.customers = (cfg.customers || []).length;
      s.projects = (cfg.projects || []).length;
      s.workOrders = (cfg.workOrders || []).length;
      s.tags = (cfg.tags || []).length;
    }
    // Tasks
    const tasks = data['wht-v3-tasks'] || data.tasks || [];
    s.tasks = Array.isArray(tasks) ? tasks.length : 0;
    // Settings
    const settings = data['wht-v3-settings'] || data.settings || null;
    s.hasSettings = !!settings;
    // Timer
    const timer = data['wht-v3-timer'] || data.timer || null;
    s.hasTimer = !!(timer && timer.status && timer.status !== 'stopped');
    return s;
  }

  async function doImport() {
    if (!rawJson || !userId) return;
    setStatus('importing');
    setError('');

    try {
      const storage = getStorage(userId);

      // Resolve data from either key format (storage keys or export wrapper keys)
      const timeData = rawJson['wht-v3-data'] || rawJson.data || null;
      const configData = rawJson['wht-v3-config'] || rawJson.config || null;
      const settingsData = rawJson['wht-v3-settings'] || rawJson.settings || null;
      const timerData = rawJson['wht-v3-timer'] || rawJson.timer || null;
      const tasksData = rawJson['wht-v3-tasks'] || rawJson.tasks || null;

      // 1. Import time entries
      if (timeData && typeof timeData === 'object' && Object.keys(timeData).length > 0) {
        if (supabaseConfigured && userId !== 'local') {
          await saveAllData(userId, timeData);
        } else {
          await storage.set('wht-v3-data', JSON.stringify(timeData));
        }
      }

      // 2. Import config
      if (configData) {
        await storage.set('wht-v3-config', JSON.stringify(configData));
      }

      // 3. Import settings
      if (settingsData) {
        await storage.set('wht-v3-settings', JSON.stringify(settingsData));
      }

      // 4. Import timer
      if (timerData) {
        await storage.set('wht-v3-timer', JSON.stringify(timerData));
      }

      // 5. Import tasks
      if (tasksData && Array.isArray(tasksData) && tasksData.length > 0) {
        if (supabaseConfigured && userId !== 'local') {
          await saveTasks(userId, tasksData);
        } else {
          await storage.set('wht-v3-tasks', JSON.stringify(tasksData));
        }
      }

      setStatus('done');
    } catch (err) {
      setError('Import failed: ' + (err.message || 'Unknown error'));
      setStatus('error');
    }
  }

  const cardStyle = {
    background: '#fff', borderRadius: 16, padding: '28px 20px', maxWidth: 560,
    width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', boxSizing: 'border-box',
  };

  const btnPrimary = {
    padding: '12px 28px', background: '#1a73e8', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  };

  const btnSecondary = {
    padding: '10px 20px', background: '#f1f3f4', color: '#202124', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f9fa', fontFamily: "'Inter', 'Roboto', -apple-system, sans-serif",
      padding: 20,
    }}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#202124', margin: 0 }}>Import Data</h1>
          <p style={{ fontSize: 14, color: '#5f6368', margin: '8px 0 0' }}>
            Upload your JSON backup from the old app
          </p>
        </div>

        {status === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#137333', marginBottom: 8 }}>Import complete!</p>
            <p style={{ fontSize: 14, color: '#5f6368', marginBottom: 24 }}>
              {preview && <>
                {preview.entries > 0 && <>{preview.entries} time entries across {preview.weeks} weeks. </>}
                {preview.tasks > 0 && <>{preview.tasks} tasks. </>}
                {preview.customers > 0 && <>{preview.customers} customers, {preview.projects} projects. </>}
              </>}
            </p>
            <button onClick={onDone} style={btnPrimary}>Open Hours Tracker</button>
          </div>
        ) : (
          <>
            {/* File upload */}
            <div style={{
              border: '2px dashed #dadce0', borderRadius: 12, padding: '28px 20px',
              textAlign: 'center', marginBottom: 16, cursor: 'pointer',
              background: '#fafafa',
            }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#1a73e8'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = '#dadce0'; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#dadce0';
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileRef.current.files = dt.files;
                  handleFile({ target: { files: dt.files } });
                }
              }}
            >
              <input ref={fileRef} type="file" accept=".json" onChange={handleFile}
                style={{ display: 'none' }} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#202124', margin: 0 }}>
                Click or drag to upload JSON file
              </p>
              <p style={{ fontSize: 12, color: '#80868b', marginTop: 4 }}>
                Or paste JSON text below
              </p>
            </div>

            {/* Paste area */}
            <textarea
              placeholder='Paste your JSON backup here...'
              style={{
                width: '100%', minHeight: 100, padding: 12, border: '1px solid #dadce0',
                borderRadius: 8, fontSize: 13, fontFamily: 'monospace', resize: 'vertical',
                boxSizing: 'border-box', marginBottom: 16,
              }}
              onChange={e => {
                if (e.target.value.trim()) handlePaste(e.target.value.trim());
              }}
            />

            {/* Preview */}
            {preview && (
              <div style={{
                background: '#e8f0fe', borderRadius: 8, padding: '14px 16px',
                marginBottom: 16, fontSize: 13, color: '#174ea6',
              }}>
                <strong>Ready to import:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  {preview.entries > 0 && <li>{preview.entries} time entries across {preview.weeks} weeks</li>}
                  {preview.tasks > 0 && <li>{preview.tasks} tasks</li>}
                  {preview.customers > 0 && <li>{preview.customers} customers, {preview.projects} projects, {preview.workOrders} work orders</li>}
                  {preview.tags > 0 && <li>{preview.tags} tags</li>}
                  {preview.hasSettings && <li>Settings &amp; defaults</li>}
                  {preview.hasTimer && <li>Active timer state</li>}
                </ul>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                color: '#d93025', fontSize: 13, marginBottom: 12,
                padding: '10px 14px', background: '#fce8e6', borderRadius: 8,
              }}>{error}</div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={onDone} style={btnSecondary}>Skip</button>
              <button
                onClick={doImport}
                disabled={!preview || status === 'importing'}
                style={{
                  ...btnPrimary,
                  opacity: (!preview || status === 'importing') ? 0.5 : 1,
                  cursor: (!preview || status === 'importing') ? 'not-allowed' : 'pointer',
                }}
              >
                {status === 'importing' ? 'Importing...' : 'Import Data'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
