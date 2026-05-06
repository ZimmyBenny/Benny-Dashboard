import { createBrowserRouter } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { TasksPage } from '../pages/TasksPage';
import { CalendarPage } from '../pages/CalendarPage';
import { DjOverviewPage } from '../pages/dj/DjOverviewPage';
import { DjEventsPage } from '../pages/dj/DjEventsPage';
import { DjEventDetailPage } from '../pages/dj/DjEventDetailPage';
import { DjQuotesPage } from '../pages/dj/DjQuotesPage';
import { DjQuoteDetailPage } from '../pages/dj/DjQuoteDetailPage';
import { DjInvoicesPage } from '../pages/dj/DjInvoicesPage';
import { DjInvoiceDetailPage } from '../pages/dj/DjInvoiceDetailPage';
import { DjCustomersPage } from '../pages/dj/DjCustomersPage';
import { DjServicesPage } from '../pages/dj/DjServicesPage';
import { DjTripsPage } from '../pages/dj/DjTripsPage';
import { DjAccountingPage } from '../pages/dj/DjAccountingPage';
import { DjSettingsPage } from '../pages/dj/DjSettingsPage';
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
import { BelegeOverviewPage } from '../pages/belege/BelegeOverviewPage';
import { BelegeListPage } from '../pages/belege/BelegeListPage';
import { BelegeOpenPaymentsPage } from '../pages/belege/BelegeOpenPaymentsPage';
import { BelegeReviewPage } from '../pages/belege/BelegeReviewPage';

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
          { path: '/dj',                  element: <DjOverviewPage /> },
          { path: '/dj/events',           element: <DjEventsPage /> },
          { path: '/dj/events/new',       element: <DjEventDetailPage /> },
          { path: '/dj/events/:id',       element: <DjEventDetailPage /> },
          { path: '/dj/quotes',           element: <DjQuotesPage /> },
          { path: '/dj/quotes/new',       element: <DjQuoteDetailPage /> },
          { path: '/dj/quotes/:id',       element: <DjQuoteDetailPage /> },
          { path: '/dj/invoices',         element: <DjInvoicesPage /> },
          { path: '/dj/invoices/new',     element: <DjInvoiceDetailPage /> },
          { path: '/dj/invoices/:id',     element: <DjInvoiceDetailPage /> },
          { path: '/dj/customers',        element: <DjCustomersPage /> },
          { path: '/dj/services',         element: <DjServicesPage /> },
          { path: '/dj/trips',            element: <DjTripsPage /> },
          { path: '/dj/accounting',       element: <DjAccountingPage /> },
          { path: '/dj/settings',         element: <DjSettingsPage /> },
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
          { path: '/haushalt',   element: <HaushaltPage /> },
          // Belege — WICHTIG: spezifische Sub-Routes VOR /:id (Plan 04-08)
          { path: '/belege',                element: <BelegeOverviewPage /> },
          { path: '/belege/alle',           element: <BelegeListPage /> },
          { path: '/belege/offen',          element: <BelegeOpenPaymentsPage /> },
          { path: '/belege/zu-pruefen',     element: <BelegeReviewPage /> },
        ],
      },
    ],
  },
]);
