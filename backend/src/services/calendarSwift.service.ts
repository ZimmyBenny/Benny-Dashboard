import { execFile } from 'child_process';
import path from 'path';
import db from '../db/connection';

const BINARY_PATH = path.join(__dirname, '../scripts/cal-tool');

// ── Sync-Mutex: verhindert parallele cal-tool Aufrufe ─────────────────────────
let syncRunning = false;

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface Calendar {
  id: string;
  title: string;
  color: string | null;
  is_visible: number;
}

export interface CalendarEvent {
  id: number;
  apple_uid: string;
  calendar_id: string | null;
  calendar_name: string;
  title: string;
  start_at: string;
  end_at: string;
  is_all_day: number;
  location: string | null;
  notes: string | null;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
}

// ── Binary-Wrapper ────────────────────────────────────────────────────────────

function execBinary<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      BINARY_PATH,
      args,
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const trimmed = stdout.trim();

        // Versuche JSON zu parsen — auch bei non-zero exit kann JSON enthalten sein
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          if (err) return reject(new Error(stderr || err.message));
          return reject(new Error(`cal-tool output is not valid JSON: ${trimmed.slice(0, 200)}`));
        }

        // Fehler-JSON vom Binary
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as Record<string, unknown>).error) {
          return reject(new Error(String((parsed as Record<string, unknown>).error)));
        }

        if (err) return reject(new Error(stderr || err.message));
        resolve(parsed as T);
      }
    );
  });
}

// ── Kalender-Liste ────────────────────────────────────────────────────────────

interface RawCalendar {
  id: string;
  title: string;
  color: string | null;
  type: string;
}

async function upsertCalendars(): Promise<void> {
  const raw = await execBinary<RawCalendar[]>(['list-calendars']);

  const upsert = db.prepare(`
    INSERT INTO calendars (id, title, color, synced_at)
    VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    ON CONFLICT(id) DO UPDATE SET
      title     = excluded.title,
      color     = excluded.color,
      synced_at = excluded.synced_at
  `);

  const txn = db.transaction(() => {
    for (const cal of raw) {
      upsert.run(cal.id, cal.title, cal.color ?? null);
    }
  });
  txn();
}

export async function getCalendars(): Promise<Calendar[]> {
  await upsertCalendars();
  // Nur sichtbare Kalender zurueckgeben
  return db.prepare('SELECT id, title, color, is_visible FROM calendars WHERE is_visible = 1 ORDER BY title').all() as Calendar[];
}

export async function getAllCalendars(): Promise<Calendar[]> {
  await upsertCalendars();
  // ALLE Kalender zurueckgeben — kein is_visible Filter
  return db.prepare('SELECT id, title, color, is_visible FROM calendars ORDER BY title').all() as Calendar[];
}

// ── Event-Sync fuer Zeitraum ──────────────────────────────────────────────────

interface RawEvent {
  id: string;
  calendarId: string;
  calendarTitle: string;
  title: string;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  location: string | null;
  notes: string | null;
}

export async function syncRange(from: string, to: string, deleteStale = false): Promise<SyncResult> {
  // Pruefen ob Zeitraum schon gecacht (< 5 Minuten alt)
  const cached = db.prepare(`
    SELECT synced_at FROM calendar_sync_ranges
    WHERE range_start = ? AND range_end = ?
  `).get(from, to) as { synced_at: string } | undefined;

  if (cached) {
    const syncedAt = new Date(cached.synced_at);
    const ageMs = Date.now() - syncedAt.getTime();
    if (ageMs < 5 * 60 * 1000) {
      console.log(`[calendar] syncRange cache hit: ${from} to ${to} (${Math.round(ageMs / 1000)}s old)`);
      return { created: 0, updated: 0, skipped: 0 };
    }
  }

  // Zeitstempel VOR dem Sync setzen — events die danach nicht aktualisiert wurden, wurden in Apple gelöscht
  const syncStartTime = new Date().toISOString();

  const raw = await execBinary<RawEvent[]>(['read', '--from', from, '--to', to]);

  let created = 0, updated = 0, skipped = 0;

  const upsert = db.prepare(`
    INSERT INTO calendar_events (apple_uid, title, start_at, end_at, is_all_day, calendar_name, calendar_id, location, notes, sync_status, last_synced_at, updated_at)
    VALUES (@uid, @title, @start_at, @end_at, @is_all_day, @calendar_name, @calendar_id, @location, @notes, 'synced', @now, @now)
    ON CONFLICT(apple_uid, start_at) DO UPDATE SET
      title         = excluded.title,
      end_at        = excluded.end_at,
      is_all_day    = excluded.is_all_day,
      calendar_name = excluded.calendar_name,
      calendar_id   = excluded.calendar_id,
      location      = excluded.location,
      notes         = excluded.notes,
      sync_status   = 'synced',
      last_synced_at = excluded.last_synced_at,
      updated_at     = excluded.updated_at
  `);

  const txn = db.transaction(() => {
    for (const evt of raw) {
      const existing = db.prepare('SELECT id FROM calendar_events WHERE apple_uid = ? AND start_at = ?')
        .get(evt.id, evt.startDate);

      upsert.run({
        uid:           evt.id,
        title:         evt.title,
        start_at:      evt.startDate,
        end_at:        evt.endDate,
        is_all_day:    evt.isAllDay ? 1 : 0,
        calendar_name: evt.calendarTitle,
        calendar_id:   evt.calendarId,
        location:      evt.location ?? null,
        notes:         evt.notes ?? null,
        now:           new Date().toISOString(),
      });

      if (existing) updated++; else created++;
    }
  });
  txn();

  // Events löschen die in Apple Calendar nicht mehr existieren.
  // Nur beim vollen Hintergrund-Sync (deleteStale=true) — nie bei engen Frontend-Syncs,
  // da überlappende Ranges sonst Events löschen die vom breiten Sync noch gültig befunden wurden.
  if (deleteStale && raw.length > 0) {
    const fromUtc = new Date(`${from}T00:00:00.000Z`);
    fromUtc.setDate(fromUtc.getDate() - 1);
    const toUtc = new Date(`${to}T23:59:59.000Z`);
    toUtc.setDate(toUtc.getDate() + 1);
    const deleted = db.prepare(
      `DELETE FROM calendar_events WHERE start_at >= ? AND start_at <= ? AND last_synced_at < ?`
    ).run(fromUtc.toISOString(), toUtc.toISOString(), syncStartTime);
    if (deleted.changes > 0) {
      console.log(`[calendar] syncRange: ${deleted.changes} gelöschte Events entfernt`);
    }
  }

  // Sync-Range Cache aktualisieren
  db.prepare(`
    INSERT INTO calendar_sync_ranges (range_start, range_end, synced_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    ON CONFLICT(range_start, range_end) DO UPDATE SET
      synced_at = excluded.synced_at
  `).run(from, to);

  console.log(`[calendar] syncRange ${from}→${to}: created=${created} updated=${updated} skipped=${skipped}`);
  return { created, updated, skipped };
}

// ── Event erstellen ───────────────────────────────────────────────────────────

interface CreateEventData {
  title: string;
  start_at: string;
  end_at: string;
  calendar_id: string;
  is_all_day?: boolean;
  location?: string;
  notes?: string;
}

export async function createEvent(data: CreateEventData): Promise<CalendarEvent> {
  const args = [
    'create',
    '--calendar-id', data.calendar_id,
    '--title', data.title,
    '--start', data.start_at,
    '--end', data.end_at,
  ];
  if (data.is_all_day)  args.push('--all-day');
  if (data.notes)       args.push('--notes', data.notes);
  if (data.location)    args.push('--location', data.location);

  const created = await execBinary<RawEvent>(args);

  // In SQLite speichern
  const result = db.prepare(`
    INSERT INTO calendar_events (apple_uid, title, start_at, end_at, is_all_day, calendar_name, calendar_id, location, notes, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
  `).run(
    created.id,
    created.title,
    created.startDate,
    created.endDate,
    created.isAllDay ? 1 : 0,
    created.calendarTitle,
    created.calendarId,
    created.location ?? null,
    created.notes ?? null,
  );

  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(result.lastInsertRowid) as CalendarEvent;
  return row;
}

// ── Event loeschen ────────────────────────────────────────────────────────────

export async function deleteEvent(appleUid: string): Promise<void> {
  await execBinary(['delete', '--event-id', appleUid]);
  db.prepare('DELETE FROM calendar_events WHERE apple_uid = ?').run(appleUid);
}

// ── Hintergrund-Sync ──────────────────────────────────────────────────────────

export async function backgroundSync(): Promise<void> {
  if (syncRunning) {
    console.log('[calendar] backgroundSync skipped — sync already running');
    return;
  }
  syncRunning = true;
  try {
    const now = new Date();

    // Aktueller Monat +/- 1 Monat
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    const from = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const to   = `${nextMonthEnd.getFullYear()}-${String(nextMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(nextMonthEnd.getDate()).padStart(2, '0')}`;

    await syncRange(from, to, true);
  } catch (err) {
    console.error('[calendar] backgroundSync error:', err);
  } finally {
    syncRunning = false;
  }
}

// ── Full Sync (Alias fuer server.ts Kompatibilitaet) ─────────────────────────

export async function fullSync(): Promise<void> {
  try {
    console.log('[calendar] Full sync starting...');
    await getCalendars();
    await backgroundSync();
    console.log('[calendar] Full sync done.');
  } catch (err) {
    console.error('[calendar] Full sync error:', err);
  }
}
