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

  // djSync-Backfill: einmaliger Sweep beim Server-Start.
  // Stellt sicher dass alle finalisierten dj_invoices einen aktuellen Mirror
  // in receipts haben (source='dj_invoice_sync'). Notwendig fuer Bestandsdaten —
  // der forward-only-Hook in dj.invoices.routes.ts deckt nur NEUE Mutationen ab.
  // Idempotent: bestehende Mirrors werden geupdated, fehlende neu angelegt.
  // Wir laufen IMMER (auch wenn Counts gleich) — dadurch heilt sich der Mirror
  // bei Schema- oder djSyncService-Aenderungen automatisch beim naechsten Start.
  import('./services/djSyncService')
    .then(({ mirrorInvoiceToReceipts }) => {
      import('./db/connection').then(({ default: db }) => {
        try {
          const invoices = db
            .prepare(
              `SELECT id FROM dj_invoices WHERE status != 'entwurf' ORDER BY id ASC`,
            )
            .all() as Array<{ id: number }>;
          let synced = 0;
          for (const inv of invoices) {
            try {
              if (mirrorInvoiceToReceipts(inv.id)) synced++;
            } catch (err) {
              console.warn(
                `[dj-sync] backfill failed for invoice ${inv.id}:`,
                (err as Error).message,
              );
            }
          }
          console.log(
            `[dj-sync] startup: synced ${synced}/${invoices.length} dj_invoices`,
          );
        } catch (err) {
          console.warn('[dj-sync] startup backfill failed:', (err as Error).message);
        }
      });
    })
    .catch((err) =>
      console.warn('[dj-sync] failed to load service:', (err as Error).message),
    );

  // Task-Automation: einmaliger Sweep beim Server-Start (offene Belege → Tasks)
  // Lazy import damit Migrations bereits abgeschlossen sind. try/catch verhindert
  // Server-Crash bei einem Task-Automation-Fehler (Plan-Threat T-04-TASK-01).
  import('./services/taskAutomationService')
    .then(({ taskAutomationService }) => {
      try {
        const r = taskAutomationService.checkOpenPayments();
        console.log(
          `[task-automation] startup: scanned=${r.scanned} tasksCreated=${r.tasksCreated}`,
        );
      } catch (err) {
        console.warn('[task-automation] startup failed:', (err as Error).message);
      }
    })
    .catch((err) =>
      console.warn('[task-automation] failed to load service:', (err as Error).message),
    );

  // Hintergrund-Sync: Apple Calendar alle 5 Minuten via Swift EventKit (kein UI-Blocking)
  // Lazy import nach Server-Start damit Migration bereits abgeschlossen ist
  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 Minuten (Swift EventKit: ~1-2s statt ~90s)
  import('./services/calendarSwift.service').then(({ fullSync }) => {
    // Einmal direkt beim Start feuern (nach 3s Verzögerung damit Server voll bereit ist)
    setTimeout(() => {
      fullSync().catch(err => console.error('[calendar] Startup sync failed:', err));
    }, 3_000);
    setInterval(() => {
      fullSync().catch(err => console.error('[calendar] Background sync failed:', err));
    }, SYNC_INTERVAL_MS);
    console.log(`[calendar] Background sync scheduled every 5 minutes (+ immediate startup sync)`);
  }).catch(err => console.error('[calendar] Failed to load calendarSwift.service:', err));

  // Apple Reminders Sync: 5min interval + Startup (versetzt zu Calendar-Sync)
  const REMINDERS_SYNC_INTERVAL_MS = 5 * 60 * 1000;
  import('./services/remindersSync.service').then(({ syncReminders }) => {
    setTimeout(() => {
      syncReminders().catch(err => console.error('[reminders] Startup sync failed:', err));
    }, 5_000); // 5s nach Server-Start, versetzt zum Calendar-Sync
    setInterval(() => {
      syncReminders().catch(err => console.error('[reminders] Background sync failed:', err));
    }, REMINDERS_SYNC_INTERVAL_MS);
    console.log('[reminders] Background sync scheduled every 5 minutes (+ startup sync)');
  }).catch(err => console.error('[reminders] Failed to load remindersSync.service:', err));

  // Verträge-Reminder-Job: einmal sofort + alle 24h
  import('./jobs/contractReminders').then(({ startContractReminderJob }) => {
    startContractReminderJob();
  }).catch(err => console.error('[contracts-cron] Failed to load contractReminders:', err));
});
