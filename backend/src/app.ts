import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import clientsRoutes from './routes/clients.routes';
import projectsRoutes from './routes/projects.routes';
import timeEntriesRoutes from './routes/timeEntries.routes';
import backupRoutes from './routes/backup.routes';
import quickLinksRoutes from './routes/quickLinks.routes';
import tasksRoutes from './routes/tasks.routes';
import calendarRoutes from './routes/calendar.routes';
import workbookRoutes from './routes/workbook.routes';
import { verifyToken, type AuthenticatedRequest } from './middleware/auth';

export function createApp() {
  const app = express();

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS — explicit origin only; never omit the options object
  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }));

  // PUBLIC — no token required
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRoutes);

  // GUARD — everything mounted AFTER this line under /api requires a valid JWT
  app.use('/api', verifyToken);

  // Protected routes — registered AFTER verifyToken guard
  app.use('/api/user', userRoutes);
  app.use('/api/clients', clientsRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/time-entries', timeEntriesRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/quick-links', quickLinksRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/workbook', workbookRoutes);

  // Temporary probe route to verify the guard end-to-end (kept; Plan 3 may remove)
  app.get('/api/_probe', (req: AuthenticatedRequest, res) => {
    res.json({ ok: true, user: req.user });
  });

  // Global error handler — MUST be last middleware
  app.use(errorHandler);

  return app;
}
