import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';

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

  // TODO Plan 2.x: register auth routes here (public)
  // app.use('/api/auth', authRoutes);

  // TODO Plan 2.x: register protected routes here (with verifyToken middleware)
  // app.use('/api/tasks', verifyToken, tasksRoutes);

  // Global error handler — MUST be last middleware
  app.use(errorHandler);

  return app;
}
