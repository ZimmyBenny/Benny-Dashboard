import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useUiStore } from '../../store/uiStore';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppShell() {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Guard: Shortcut nicht in Eingabefeldern ausloesen (per D-12, SHELL-06)
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (event.key === '[') {
        toggleSidebar();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleSidebar]);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--color-background)', position: 'relative' }}
    >
      {/* Global ambient light leaks — subtle atmospheric depth */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, right: 0,
        width: '600px', height: '600px',
        background: 'radial-gradient(circle at top right, rgba(204,151,255,0.05) 0%, transparent 60%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: 0, left: '30%',
        width: '500px', height: '400px',
        background: 'radial-gradient(circle at bottom left, rgba(52,181,250,0.04) 0%, transparent 60%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0" style={{ position: 'relative', zIndex: 1 }}>
        <Header />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
