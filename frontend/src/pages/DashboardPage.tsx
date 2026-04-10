import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Guten Morgen, Benny';
  if (hour >= 12 && hour < 18) return 'Guten Nachmittag, Benny';
  if (hour >= 18 && hour < 22) return 'Guten Abend, Benny';
  return 'Gute Nacht, Benny';
}

const modules = [
  { path: '/',          label: 'Dashboard',     icon: 'dashboard',              description: 'Dein Command Center auf einen Blick' },
  { path: '/tasks',     label: 'Aufgaben',      icon: 'task_alt',               description: 'Aufgaben planen, verfolgen, erledigen' },
  { path: '/calendar',  label: 'Kalender',      icon: 'calendar_month',         description: 'Termine und Events im Ueberblick' },
  { path: '/dj',        label: 'DJ',            icon: 'headphones',             description: 'Gigs, Bookings und Zahlungsstatus' },
  { path: '/finances',  label: 'Finanzen',      icon: 'account_balance_wallet', description: 'Einnahmen, Ausgaben und Budgets' },
  { path: '/amazon',    label: 'Amazon',        icon: 'shopping_cart',          description: 'Bestellungen und Retouren tracken' },
  { path: '/settings',  label: 'Einstellungen', icon: 'settings',               description: 'Passwort, Version und Praeferenzen' },
];

export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <PageWrapper>
      <h1
        className="text-3xl font-bold mb-8"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        {getGreeting()}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {modules.map((mod) => (
          <Card key={mod.path} hoverable onClick={() => navigate(mod.path)}>
            <div className="p-6 flex flex-col gap-3">
              <span
                className="material-symbols-outlined text-4xl"
                style={{ color: 'var(--color-primary)' }}
              >
                {mod.icon}
              </span>
              <h2
                className="text-lg font-semibold"
                style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
              >
                {mod.label}
              </h2>
              <p
                className="text-sm"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                {mod.description}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </PageWrapper>
  );
}
