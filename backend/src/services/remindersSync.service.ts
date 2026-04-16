import { execFile } from 'child_process';
import path from 'path';
import db from '../db/connection';

const SCRIPT_PATH = path.join(__dirname, '../scripts/reminders-jxa.js');

// ── Sync-Mutex: verhindert parallele osascript-Aufrufe ────────────────────────
let syncRunning = false;

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface AppleReminder {
  id: number;
  apple_uid: string;
  title: string;
  list_name: string | null;
  due_date: string | null;
  reminder_date: string | null;
  completed: number;
  notes: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface RawReminder {
  id: string;
  title: string;
  listName: string;
  dueDate: string | null;
  reminderDate: string | null;
  completed: boolean;
  notes: string | null;
}

// ── JXA-Wrapper ───────────────────────────────────────────────────────────────

function execJXA<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', SCRIPT_PATH, ...args],
      { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const trimmed = stdout.trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          if (err) return reject(new Error(stderr || err.message));
          return reject(new Error(`reminders-jxa output is not valid JSON: ${trimmed.slice(0, 200)}`));
        }

        // Fehler-JSON vom Skript
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          (parsed as Record<string, unknown>).error
        ) {
          return reject(new Error(String((parsed as Record<string, unknown>).error)));
        }

        if (err) return reject(new Error(stderr || err.message));
        resolve(parsed as T);
      }
    );
  });
}

// ── syncReminders ─────────────────────────────────────────────────────────────

export async function syncReminders(): Promise<void> {
  if (syncRunning) {
    console.log('[reminders] syncReminders skipped — sync already running');
    return;
  }
  syncRunning = true;

  try {
    const syncStartTime = new Date().toISOString();

    const raw = await execJXA<RawReminder[]>([]);

    const upsert = db.prepare(`
      INSERT INTO apple_reminders (apple_uid, title, list_name, due_date, reminder_date, completed, notes, last_synced_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(apple_uid) DO UPDATE SET
        title          = excluded.title,
        list_name      = excluded.list_name,
        due_date       = excluded.due_date,
        reminder_date  = excluded.reminder_date,
        completed      = 0,
        notes          = excluded.notes,
        last_synced_at = excluded.last_synced_at
    `);

    const txn = db.transaction(() => {
      for (const r of raw) {
        upsert.run(
          r.id,
          r.title,
          r.listName ?? null,
          r.dueDate ?? null,
          r.reminderDate ?? null,
          r.notes ?? null,
          syncStartTime,
        );
      }
    });
    txn();

    // Stale-Cleanup: Einträge die beim letzten Sync nicht mehr in Apple waren (gelöscht)
    const deleted = db.prepare(
      `DELETE FROM apple_reminders WHERE completed = 0 AND (last_synced_at IS NULL OR last_synced_at < ?)`
    ).run(syncStartTime);

    console.log(`[reminders] syncReminders: ${raw.length} reminders, ${deleted.changes} deleted`);
  } finally {
    syncRunning = false;
  }
}

// ── markReminderCompleted ─────────────────────────────────────────────────────

export async function markReminderCompleted(appleUid: string): Promise<void> {
  await execJXA<{ ok: true }>(['complete', appleUid]);
  // Lokal sofort entfernen — nächster Sync würde sie sowieso nicht mehr mitbringen
  db.prepare('DELETE FROM apple_reminders WHERE apple_uid = ?').run(appleUid);
}

// ── backgroundReminderSync ────────────────────────────────────────────────────

export async function backgroundReminderSync(): Promise<void> {
  try {
    await syncReminders();
  } catch (err) {
    console.error('[reminders] backgroundReminderSync error:', err);
  }
}
