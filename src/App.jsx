import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import WorkHoursTracker from './WorkHoursTracker';
import ImportData from './ImportData';
import Login from './Login';

function AppContent() {
  const { user, loading, supabaseConfigured } = useAuth();
  const [page, setPage] = useState(window.location.hash === '#import' ? 'import' : 'app');

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', 'Roboto', -apple-system, sans-serif",
        background: '#f8f9fa',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏱️</div>
          <div style={{ fontSize: 16, color: '#5f6368' }}>Loading...</div>
        </div>
      </div>
    );
  }

  // If Supabase is configured, require auth
  if (supabaseConfigured && !user) {
    return <Login />;
  }

  if (page === 'import') {
    return <ImportData onDone={() => { window.location.hash = ''; setPage('app'); window.location.reload(); }} />;
  }

  return <WorkHoursTracker onImport={() => { window.location.hash = '#import'; setPage('import'); }} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
