export interface NavItem {
  path: string;
  label: string;
  icon: string; // Material Symbols Outlined icon name
}

export const navItems: NavItem[] = [
  { path: '/',         label: 'Dashboard', icon: 'dashboard' },
  { path: '/tasks',    label: 'Aufgaben',  icon: 'task_alt' },
  { path: '/calendar', label: 'Kalender',  icon: 'calendar_month' },
  { path: '/dj',       label: 'DJ',        icon: 'headphones' },
  { path: '/finances', label: 'Finanzen',  icon: 'account_balance_wallet' },
  { path: '/amazon',   label: 'Amazon',    icon: 'shopping_cart' },
];

// Settings ist kein Teil von navItems — wird separat gerendert (per D-09: margin-top: auto, kein Divider)
export const settingsItem: NavItem = {
  path: '/settings',
  label: 'Einstellungen',
  icon: 'settings',
};

// Seitennamen-Mapping fuer den Header (per D-15)
export const pageNames: Record<string, string> = {
  '/':          'Dashboard',
  '/tasks':     'Aufgaben',
  '/calendar':  'Kalender',
  '/dj':        'DJ',
  '/finances':  'Finanzen',
  '/amazon':    'Amazon',
  '/settings':  'Einstellungen',
};
