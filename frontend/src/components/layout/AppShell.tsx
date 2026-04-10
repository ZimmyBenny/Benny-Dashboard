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
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
