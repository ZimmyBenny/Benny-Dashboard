import { useNavigate } from 'react-router-dom';
import { logoutRequest } from './api/auth.api';

function App() {
  const navigate = useNavigate();

  async function handleLogout() {
    await logoutRequest();
    navigate('/login', { replace: true });
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ backgroundColor: 'var(--color-noir-bg)', fontFamily: 'var(--font-inter)' }}
    >
      <h1
        style={{
          color: 'var(--color-primary)',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          fontFamily: 'var(--font-epilogue)',
        }}
      >
        Benny Dashboard — Authenticated
      </h1>
      <p style={{ color: 'var(--color-secondary)' }}>
        Phase 3 will replace this with the AppShell + sidebar.
      </p>
      <button
        type="button"
        onClick={handleLogout}
        className="px-6 py-2 rounded-full"
        style={{
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
          color: 'var(--color-noir-bg)',
        }}
      >
        Logout
      </button>
    </div>
  );
}

export default App;
