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
import { SettingsPage } from '../pages/SettingsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/',         element: <DashboardPage /> },
          { path: '/tasks',    element: <TasksPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/dj',       element: <DjPage /> },
          { path: '/finances', element: <FinancesPage /> },
          { path: '/amazon',   element: <AmazonPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
