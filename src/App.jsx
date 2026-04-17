import { useState, Component } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import WorkHoursTracker from './WorkHoursTracker';
import ImportData from './ImportData';
import Login from './Login';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ color: '#d93025' }}>Something went wrong</h2>
          <pre style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 13, border: '1px solid #dadce0' }}>
            {this.state.error.toString()}
            {this.state.info?.componentStack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '10px 24px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  return <ErrorBoundary><WorkHoursTracker onImport={() => { window.location.hash = '#import'; setPage('import'); }} /></ErrorBoundary>;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
