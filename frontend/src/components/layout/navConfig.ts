export interface NavItem {
  path: string;
  label: string;
  icon: string; // Material Symbols Outlined icon name
  indent?: boolean; // Unter-Eintrag (eingerückt unter übergeordnetem Item)
}

export const navItems: NavItem[] = [
  { path: '/',                label: 'Dashboard',         icon: 'dashboard' },
  { path: '/tasks',            label: 'Aufgaben',          icon: 'task_alt' },
  { path: '/zeiterfassung',   label: 'Zeiterfassung',     icon: 'timer' },
  { path: '/arbeitsmappe',    label: 'Arbeitsmappe',      icon: 'menu_book' },
  { path: '/contacts',        label: 'Kontakte',          icon: 'contacts' },
  { path: '/calendar',        label: 'Kalender',          icon: 'calendar_month' },
  { path: '/dj',              label: 'DJ',                icon: 'headphones' },
  { path: '/amazon',          label: 'Amazon',            icon: 'shopping_cart' },
  { path: '/finances',        label: 'Finanzen',          icon: 'account_balance_wallet' },
  { path: '/haushalt', label: 'Haushalt',        icon: 'family_restroom' },
  { path: '/contracts',       label: 'Verträge & Fristen', icon: 'description' },
  { path: '/ki-agenten',      label: 'KI Agenten',        icon: 'smart_toy' },
];

// Settings ist kein Teil von navItems — wird separat gerendert (per D-09: margin-top: auto, kein Divider)
export const settingsItem: NavItem = {
  path: '/settings',
  label: 'Einstellungen',
  icon: 'settings',
};

// Seitennamen-Mapping fuer den Header (per D-15)
export const pageNames: Record<string, string> = {
  '/':                'Dashboard',
  '/zeiterfassung':   'Zeiterfassung',
  '/tasks':           'Aufgaben',
  '/arbeitsmappe':    'Arbeitsmappe',
  '/calendar':        'Kalender',
  '/dj':              'DJ',
  '/finances':        'Finanzen',
  '/amazon':          'Amazon',
  '/contacts':        'Kontakte',
  '/haushalt': 'Haushalt',
  '/contracts':       'Verträge & Fristen',
  '/ki-agenten':      'KI Agenten',
  '/settings':        'Einstellungen',
};
