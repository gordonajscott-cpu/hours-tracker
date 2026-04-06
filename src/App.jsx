import { AuthProvider, useAuth } from './lib/AuthContext';
import WorkHoursTracker from './WorkHoursTracker';
import Login from './Login';

function AppContent() {
  const { user, loading, supabaseConfigured } = useAuth();

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

  return <WorkHoursTracker />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
