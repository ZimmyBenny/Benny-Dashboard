import { useLocation } from 'react-router-dom';
import { pageNames } from './navConfig';

export function Header() {
  const location = useLocation();
  const pageName = pageNames[location.pathname] ?? location.pathname;

  return (
    <header
      className="flex items-center justify-between h-14 px-6 flex-shrink-0"
      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
    >
      <span
        className="font-headline font-bold text-sm tracking-wide"
        style={{ color: 'var(--color-on-surface)' }}
      >
        Benny Dashboard
      </span>
      <span
        className="text-sm"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        {pageName}
      </span>
    </header>
  );
}
