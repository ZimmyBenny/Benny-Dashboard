import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function PrivateRoute() {
  const token = useAuthStore((state) => state.token);
  const [hydrated, setHydrated] = useState<boolean>(() => {
    // hasHydrated may be true on second mount (persist middleware caches)
    return useAuthStore.persist?.hasHydrated?.() ?? true;
  });

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    // Double-check in case hydration already finished between render and effect
    if (useAuthStore.persist?.hasHydrated?.()) setHydrated(true);
    return () => { unsub?.(); };
  }, [hydrated]);

  if (!hydrated) {
    // Intentional null (not a spinner) — hydration is synchronous in practice
    // for localStorage, so this is a 1-frame gate. No flash to /login.
    return null;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
