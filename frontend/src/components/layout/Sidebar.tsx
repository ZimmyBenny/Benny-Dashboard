import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { navItems, settingsItem } from './navConfig';
import type { NavItem } from './navConfig';
import apiClient from '../../api/client';

function SidebarNavLink({
  item,
  collapsed,
  end,
}: {
  item: NavItem;
  collapsed: boolean;
  end?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NavLink
        to={item.path}
        end={end}
        className="flex items-center gap-3 rounded-lg transition-all duration-150"
        style={({ isActive }) => ({
          padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
          justifyContent: collapsed ? 'center' : undefined,
          color: isActive
            ? 'var(--color-primary)'
            : hovered
            ? 'var(--color-on-surface)'
            : 'var(--color-on-surface-variant)',
          backgroundColor: isActive
            ? 'var(--color-surface-container-high)'
            : hovered
            ? 'rgba(255,255,255,0.07)'
            : 'transparent',
          boxShadow: isActive ? 'inset 3px 0 0 var(--color-primary)' : 'none',
        })}
      >
        <span
          className="material-symbols-outlined flex-shrink-0"
          style={{ fontSize: '20px' }}
        >
          {item.icon}
        </span>
        {!collapsed && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            fontWeight: hovered ? 700 : 500,
            letterSpacing: '0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'font-weight 0.1s',
          }}>
            {item.label}
          </span>
        )}
      </NavLink>

      {/* Tooltip when collapsed */}
      {collapsed && (
        <div
          className="pointer-events-none absolute left-full top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{
            marginLeft: '8px',
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {item.label}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  type BackupState = 'idle' | 'loading' | 'success' | 'error';
  const [backupState, setBackupState] = useState<BackupState>('idle');
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(() => {
    const s = localStorage.getItem('lastBackupAt');
    return s ? new Date(s) : null;
  });

  const [hoveredToggle, setHoveredToggle] = useState(false);
  const [hoveredBackup, setHoveredBackup] = useState(false);
  const [hoveredTheme, setHoveredTheme] = useState(false);
  const [hoveredLogout, setHoveredLogout] = useState(false);

  function formatLastBackup(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMin = Math.floor(diffMs / (1000 * 60));
    const isToday = date.toDateString() === now.toDateString();
    if (diffMin < 1) return 'gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min.`;
    if (isToday) return `vor ${diffH} Std.`;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'gestern';
    return `vor ${diffDays} Tagen`;
  }

  async function handleBackup() {
    setBackupState('loading');
    try {
      await apiClient.post('/backup');
      const now = new Date();
      setLastBackupAt(now);
      localStorage.setItem('lastBackupAt', now.toISOString());
      setBackupState('success');
      setTimeout(() => setBackupState('idle'), 3000);
    } catch {
      setBackupState('error');
      setTimeout(() => setBackupState('idle'), 3000);
    }
  }

  const btnBaseStyle = (hovered: boolean, extraColor?: string) => ({
    color: extraColor ?? (hovered ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)'),
    background: hovered ? 'rgba(255,255,255,0.07)' : 'transparent',
    border: 'none',
    cursor: 'pointer',
  });

  return (
    <aside
      className="flex flex-col h-screen flex-shrink-0 overflow-hidden transition-[width] duration-150 ease-out"
      style={{
        width: collapsed ? '52px' : '240px',
        backgroundColor: '#0a0a0f',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '2px 0 16px rgba(0,0,0,0.6)',
      }}
    >
      {/* Brand mark */}
      <div
        className="flex items-center flex-shrink-0"
        style={{
          height: '56px',
          padding: collapsed ? '0' : '0 1rem',
          justifyContent: collapsed ? 'center' : undefined,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {collapsed ? (
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 900,
              fontSize: '0.8rem',
              color: '#000',
              letterSpacing: '-0.02em',
            }}>B</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', overflow: 'hidden' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 900, fontSize: '0.7rem', color: '#000',
              }}>B</span>
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 700,
                fontSize: '0.8125rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-on-surface)',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}>Dashboard</p>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.625rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-outline)',
                lineHeight: 1,
              }}>Benny</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1" style={{ overflowY: 'auto' }}>
        {navItems.map((item) => (
          <SidebarNavLink
            key={item.path}
            item={item}
            collapsed={collapsed}
            end={item.path === '/'}
          />
        ))}
      </nav>

      {/* Toggle collapse button */}
      <div className="p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={toggleSidebar}
          onMouseEnter={() => setHoveredToggle(true)}
          onMouseLeave={() => setHoveredToggle(false)}
          className="flex items-center gap-3 rounded-lg transition-all duration-150 w-full"
          style={{
            padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
            justifyContent: collapsed ? 'center' : undefined,
            ...btnBaseStyle(hoveredToggle),
          }}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        >
          <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '20px' }}>
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
          {!collapsed && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8125rem',
              fontWeight: hoveredToggle ? 700 : 500,
              letterSpacing: '0.01em',
            }}>
              Einklappen
            </span>
          )}
        </button>
      </div>

      {/* Backup + Settings + Logout */}
      <div className="p-2" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>

        {/* Backup Button */}
        <div className="relative group">
          <button
            onClick={handleBackup}
            disabled={backupState === 'loading'}
            onMouseEnter={() => setHoveredBackup(true)}
            onMouseLeave={() => setHoveredBackup(false)}
            className="flex items-center gap-3 rounded-lg transition-all duration-150 w-full"
            style={{
              padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
              justifyContent: collapsed ? 'center' : undefined,
              border: 'none',
              cursor: backupState === 'loading' ? 'default' : 'pointer',
              opacity: backupState === 'loading' ? 0.6 : 1,
              color: backupState === 'success'
                ? 'var(--color-secondary)'
                : backupState === 'error'
                ? '#f87171'
                : hoveredBackup
                ? 'var(--color-on-surface)'
                : 'var(--color-on-surface-variant)',
              background: hoveredBackup && backupState === 'idle' ? 'rgba(255,255,255,0.07)' : 'transparent',
            }}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '20px' }}>
              {backupState === 'success' ? 'cloud_done' : backupState === 'error' ? 'cloud_off' : 'backup'}
            </span>
            {!collapsed && (
              <>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  fontWeight: hoveredBackup ? 700 : 500,
                  letterSpacing: '0.01em',
                }}>
                  {backupState === 'loading' ? 'Sichern…' : backupState === 'success' ? 'Gesichert!' : backupState === 'error' ? 'Fehler' : 'Backup'}
                </span>
                {lastBackupAt && backupState === 'idle' && (
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.625rem',
                    color: 'var(--color-outline)',
                    marginLeft: 'auto',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatLastBackup(lastBackupAt)}
                  </span>
                )}
              </>
            )}
          </button>
          {collapsed && (
            <div
              className="pointer-events-none absolute left-full top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{
                marginLeft: '8px',
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              Backup
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <div className="relative group">
          <button
            onClick={toggleTheme}
            onMouseEnter={() => setHoveredTheme(true)}
            onMouseLeave={() => setHoveredTheme(false)}
            className="flex items-center gap-3 rounded-lg transition-all duration-150 w-full"
            style={{
              padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
              justifyContent: collapsed ? 'center' : undefined,
              ...btnBaseStyle(hoveredTheme),
            }}
            title={theme === 'dark' ? 'Tagmodus' : 'Nachtmodus'}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '20px' }}>
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
            {!collapsed && (
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                fontWeight: hoveredTheme ? 700 : 500,
                letterSpacing: '0.01em',
              }}>
                {theme === 'dark' ? 'Tagmodus' : 'Nachtmodus'}
              </span>
            )}
          </button>
          {collapsed && (
            <div
              className="pointer-events-none absolute left-full top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{
                marginLeft: '8px',
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              {theme === 'dark' ? 'Tagmodus' : 'Nachtmodus'}
            </div>
          )}
        </div>

        <SidebarNavLink item={settingsItem} collapsed={collapsed} />

        {/* Logout */}
        <div className="relative group">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            onMouseEnter={() => setHoveredLogout(true)}
            onMouseLeave={() => setHoveredLogout(false)}
            className="flex items-center gap-3 rounded-lg transition-all duration-150 w-full"
            style={{
              padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
              justifyContent: collapsed ? 'center' : undefined,
              ...btnBaseStyle(hoveredLogout),
            }}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '20px' }}>
              logout
            </span>
            {!collapsed && (
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                fontWeight: hoveredLogout ? 700 : 500,
                letterSpacing: '0.01em',
              }}>
                Abmelden
              </span>
            )}
          </button>
          {collapsed && (
            <div
              className="pointer-events-none absolute left-full top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{
                marginLeft: '8px',
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              Abmelden
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
