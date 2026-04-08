import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';

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

  // Health check — public, no auth required
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Public auth routes — MUST be registered BEFORE any verifyToken middleware
  app.use('/api/auth', authRoutes);

  // TODO Plan 2.3: apply verifyToken here, then register protected routes
  // app.use('/api', verifyToken);
  // app.use('/api/tasks', tasksRoutes);

  // Global error handler — MUST be last middleware
  app.use(errorHandler);

  return app;
}
