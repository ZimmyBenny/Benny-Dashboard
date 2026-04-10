import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';
import { createApp } from './app';
import { runMigrations } from './db/migrate';

// dotenv/config above loads .env from cwd (works when launched from project root via `tsx watch backend/src/server.ts`).
// Secondary load: resolve relative to this file so `npm run dev` inside backend/ also finds the root .env.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// CRITICAL: Validate JWT_SECRET at startup — no fallback, ever.
// This prevents the server from running with a missing or empty secret.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  console.error('[FATAL] JWT_SECRET is not set in environment. Refusing to start.');
  console.error('Set JWT_SECRET in .env — generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

// JWT_SECRET length check — must be at least 32 characters
if (process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET is too short. Use at least 32 characters (64-byte hex recommended).');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Run all unapplied SQL migrations before accepting requests
runMigrations();

const app = createApp();

app.listen(PORT, () => {
  console.log(`[server] Benny Dashboard API running on http://localhost:${PORT}`);
  console.log(`[server] Health: http://localhost:${PORT}/api/health`);

  // Hintergrund-Sync: Apple Calendar alle 10 Minuten (kein UI-Blocking)
  // Lazy import nach Server-Start damit Migration bereits abgeschlossen ist
  const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten
  import('./services/calendarSync.service').then(({ fullSync }) => {
    setInterval(() => {
      fullSync().catch(err => console.error('[calendar] Background sync failed:', err));
    }, SYNC_INTERVAL_MS);
    console.log(`[calendar] Background sync scheduled every 10 minutes`);
  }).catch(err => console.error('[calendar] Failed to load calendarSync.service:', err));
});
