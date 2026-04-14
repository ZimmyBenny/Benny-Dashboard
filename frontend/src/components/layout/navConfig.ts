export interface NavItem {
  path: string;
  label: string;
  icon: string; // Material Symbols Outlined icon name
  indent?: boolean; // Unter-Eintrag (eingerückt unter übergeordnetem Item)
  subItems?: NavItem[]; // Aufklappbares Untermenü (z.B. DJ-Modul)
}

export const navItems: NavItem[] = [
  { path: '/',                label: 'Dashboard',         icon: 'dashboard' },
  { path: '/tasks',            label: 'Aufgaben',          icon: 'task_alt' },
  { path: '/zeiterfassung',   label: 'Zeiterfassung',     icon: 'timer' },
  { path: '/arbeitsmappe',    label: 'Arbeitsmappe',      icon: 'menu_book' },
  { path: '/contacts',        label: 'Kontakte',          icon: 'contacts' },
  { path: '/calendar',        label: 'Kalender',          icon: 'calendar_month' },
  { path: '/dj', label: 'DJ', icon: 'equalizer', subItems: [
    { path: '/dj',              label: 'Übersicht',          icon: 'dashboard' },
    { path: '/dj/events',       label: 'Events & Anfragen',  icon: 'event' },
    { path: '/dj/quotes',       label: 'Angebote',           icon: 'description' },
    { path: '/dj/invoices',     label: 'Rechnungen',         icon: 'receipt_long' },
    { path: '/dj/customers',    label: 'Kunden',             icon: 'group' },
    { path: '/dj/services',     label: 'Leistungen & Pakete',icon: 'inventory_2' },
    { path: '/dj/trips',        label: 'Fahrten',            icon: 'directions_car' },
    { path: '/dj/accounting',   label: 'Buchhaltung',        icon: 'account_balance' },
    { path: '/dj/settings',     label: 'DJ Einstellungen',   icon: 'tune' },
  ]},
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
  '/dj':              'DJ Übersicht',
  '/dj/events':       'Events & Anfragen',
  '/dj/quotes':       'Angebote',
  '/dj/invoices':     'Rechnungen',
  '/dj/customers':    'Kunden',
  '/dj/services':     'Leistungen & Pakete',
  '/dj/trips':        'Fahrten',
  '/dj/accounting':   'Buchhaltung',
  '/dj/settings':     'DJ Einstellungen',
  '/finances':        'Finanzen',
  '/amazon':          'Amazon',
  '/contacts':        'Kontakte',
  '/haushalt': 'Haushalt',
  '/contracts':       'Verträge & Fristen',
  '/ki-agenten':      'KI Agenten',
  '/settings':        'Einstellungen',
};
