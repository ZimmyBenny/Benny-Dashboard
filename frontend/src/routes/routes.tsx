import { createBrowserRouter } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { LoginPage } from '../pages/LoginPage';
import App from '../App';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <PrivateRoute />,
    children: [
      { path: '/', element: <App /> },
      // Phase 3 replaces App with AppShell + nested module routes
    ],
  },
]);
