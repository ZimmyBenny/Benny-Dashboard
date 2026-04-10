import { NavLink } from 'react-router-dom';
import { useUiStore } from '../../store/uiStore';
import { navItems, settingsItem } from './navConfig';
import type { NavItem } from './navConfig';

function SidebarNavLink({
  item,
  collapsed,
  end,
}: {
  item: NavItem;
  collapsed: boolean;
  end?: boolean;
}) {
  return (
    <div className="relative group">
      <NavLink
        to={item.path}
        end={end}
        className={({ isActive }) =>
          [
            'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150',
            isActive
              ? 'text-primary bg-surface-container-high'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high',
            collapsed ? 'justify-center' : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
        style={({ isActive }) =>
          isActive
            ? { color: 'var(--color-primary)', backgroundColor: 'var(--color-surface-container-high)' }
            : {}
        }
      >
        <span
          className="material-symbols-outlined flex-shrink-0"
          style={{ fontSize: '22px' }}
        >
          {item.icon}
        </span>
        {!collapsed && (
          <span className="truncate text-sm font-medium">{item.label}</span>
        )}
      </NavLink>

      {/* CSS-Tooltip — nur sichtbar wenn collapsed */}
      {collapsed && (
        <div
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
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

  return (
    <aside
      className="flex flex-col h-screen flex-shrink-0 overflow-hidden transition-[width] duration-150 ease-out"
      style={{
        width: collapsed ? '52px' : '240px',
        backgroundColor: 'var(--color-surface-container)',
      }}
    >
      {/* Logo / App-Kuerzel */}
      <div
        className="flex items-center h-14 px-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-surface-container-high)' }}
      >
        {collapsed ? (
          <span
            className="material-symbols-outlined mx-auto"
            style={{ color: 'var(--color-primary)', fontSize: '22px' }}
          >
            bolt
          </span>
        ) : (
          <span
            className="font-headline font-bold text-sm tracking-wide truncate"
            style={{ color: 'var(--color-primary)' }}
          >
            Benny Dashboard
          </span>
        )}
      </div>

      {/* Haupt-Navigation */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {navItems.map((item) => (
          <SidebarNavLink
            key={item.path}
            item={item}
            collapsed={collapsed}
            end={item.path === '/'}
          />
        ))}
      </nav>

      {/* Settings am unteren Ende — mt-auto via separatem Wrapper (kein Divider, per D-09) */}
      <div className="p-2 mt-auto">
        <SidebarNavLink item={settingsItem} collapsed={collapsed} />
      </div>
    </aside>
  );
}
