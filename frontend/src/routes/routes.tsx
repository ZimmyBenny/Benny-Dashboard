import { createBrowserRouter } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { TasksPage } from '../pages/TasksPage';
import { CalendarPage } from '../pages/CalendarPage';
import { DjPage } from '../pages/DjPage';
import { FinancesPage } from '../pages/FinancesPage';
import { AmazonPage } from '../pages/AmazonPage';
import { KiAgentsPage } from '../pages/KiAgentsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ZeiterfassungPage } from '../pages/ZeiterfassungPage';
import { WorkbookPage } from '../pages/WorkbookPage';
import { ContactsPage } from '../pages/ContactsPage';
import { ContactDetailPage } from '../pages/ContactDetailPage';
import { ContactFormPage } from '../pages/ContactFormPage';
import { ContactImportPage } from '../pages/ContactImportPage';
import { ContractsPage } from '../pages/ContractsPage';
import { HaushaltPage } from '../pages/HaushaltPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/',               element: <DashboardPage /> },
          { path: '/zeiterfassung',  element: <ZeiterfassungPage /> },
          { path: '/tasks',          element: <TasksPage /> },
          { path: '/arbeitsmappe',   element: <WorkbookPage /> },
          { path: '/calendar',       element: <CalendarPage /> },
          { path: '/dj',             element: <DjPage /> },
          { path: '/finances',       element: <FinancesPage /> },
          { path: '/amazon',         element: <AmazonPage /> },
          { path: '/ki-agenten',     element: <KiAgentsPage /> },
          { path: '/settings',       element: <SettingsPage /> },
          // Kontakte — WICHTIG: /new und /import VOR /:id
          { path: '/contacts',            element: <ContactsPage /> },
          { path: '/contacts/new',        element: <ContactFormPage /> },
          { path: '/contacts/import',     element: <ContactImportPage /> },
          { path: '/contacts/:id',        element: <ContactDetailPage /> },
          { path: '/contacts/:id/edit',   element: <ContactFormPage /> },
          { path: '/contracts',            element: <ContractsPage /> },
          { path: '/finanzen/haushalt',   element: <HaushaltPage /> },
        ],
      },
    ],
  },
]);
