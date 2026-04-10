import { useState } from 'react';
import { supabase } from './lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: "'Inter', 'Roboto', -apple-system, sans-serif",
      padding: '16px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '32px 24px', width: '100%', maxWidth: 380,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⏱️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#202124', margin: 0 }}>Hours Tracker</h1>
          <p style={{ fontSize: 14, color: '#5f6368', margin: '8px 0 0' }}>
            {isSignUp ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#202124', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{
                width: '100%', padding: '12px 14px', border: '1px solid #dadce0', borderRadius: 8,
                fontSize: 16, outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#1a73e8'}
              onBlur={e => e.target.style.borderColor = '#dadce0'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#202124', marginBottom: 6 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              minLength={6}
              style={{
                width: '100%', padding: '12px 14px', border: '1px solid #dadce0', borderRadius: 8,
                fontSize: 16, outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#1a73e8'}
              onBlur={e => e.target.style.borderColor = '#dadce0'}
            />
          </div>

          {error && <div style={{ color: '#d93025', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#fce8e6', borderRadius: 8 }}>{error}</div>}
          {message && <div style={{ color: '#137333', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#e6f4ea', borderRadius: 8 }}>{message}</div>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px', background: '#1a73e8', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
            style={{
              background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}>
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
