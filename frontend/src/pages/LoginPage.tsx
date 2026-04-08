import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { loginRequest } from '../api/auth.api';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already logged in and user navigates to /login, bounce to /
  if (token) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginRequest(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: 'var(--color-noir-bg)', fontFamily: 'var(--font-inter)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-8 rounded-2xl"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          boxShadow: 'var(--glow-primary)',
        }}
      >
        <h1
          className="text-2xl mb-6"
          style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-epilogue)' }}
        >
          Benny Dashboard
        </h1>

        <label
          className="block text-sm mb-2"
          style={{ color: 'var(--color-primary)' }}
          htmlFor="username"
        >
          Username
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full mb-4 px-3 py-2 rounded-md outline-hidden"
          style={{
            backgroundColor: 'var(--color-surface-variant)',
            color: '#ffffff', // white input text — not yet a design token
          }}
        />

        <label
          className="block text-sm mb-2"
          style={{ color: 'var(--color-primary)' }}
          htmlFor="password"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full mb-6 px-3 py-2 rounded-md outline-hidden"
          style={{
            backgroundColor: 'var(--color-surface-variant)',
            color: '#ffffff', // white input text — not yet a design token
          }}
        />

        {error && (
          <div
            className="mb-4 text-sm"
            style={{ color: '#ff6b6b' }} // error red — Phase 3 will add as a CSS token
            role="alert"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 rounded-full font-medium"
          style={{
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            color: 'var(--color-noir-bg)',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Signing in\u2026' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
