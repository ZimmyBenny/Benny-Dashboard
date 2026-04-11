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
        ],
      },
    ],
  },
]);
