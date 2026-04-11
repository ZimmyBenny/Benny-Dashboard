import { execFile } from 'child_process';
import path from 'path';
import db from '../db/connection';

const SCRIPTS_DIR = path.join(__dirname, '../scripts');
const DAYS_BACK = process.env.CALENDAR_DAYS_BACK ?? '30';
const DAYS_FORWARD = process.env.CALENDAR_DAYS_FORWARD ?? '90';

// ── execFile-Wrapper ───────────────────────────────────────────────────────────

function runScript(scriptName: string, env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    execFile(
      'osascript',
      [scriptPath],
      { env: { ...process.env, ...env }, timeout: 300_000, maxBuffer: 1024 * 1024 * 10 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout.trim());
      }
    );
  });
}

// ── Hilfsfunktion: Epoch zu ISO UTC ───────────────────────────────────────────

function epochToISO(epochSecs: number): string {
  return new Date(epochSecs * 1000).toISOString();
}

// ── Kalender-Liste aus Apple Calendar ─────────────────────────────────────────

export interface CalendarInfo {
  name: string;
  color: string;
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const raw = await runScript('cal-list-calendars.applescript');
  return JSON.parse(raw) as CalendarInfo[];
}

// ── Neue Kalender erkennen ────────────────────────────────────────────────────

export async function detectNewCalendars(): Promise<string[]> {
  const appleCalendars = await listCalendars();
  const known = new Set<string>(
    (db.prepare('SELECT name FROM known_calendars').all() as Array<{ name: string }>).map(r => r.name)
  );
  const newOnes = appleCalendars.filter(c => !known.has(c.name));
  // Alle erkannten Kalender in known_calendars eintragen (inkl. neue)
  const insert = db.prepare('INSERT OR IGNORE INTO known_calendars (name) VALUES (?)');
  for (const cal of appleCalendars) insert.run(cal.name);
  // Farben fuer alle Kalender aktualisieren
  const updateColor = db.prepare('UPDATE known_calendars SET color = ? WHERE name = ? AND (color IS NULL OR color != ?)');
  for (const cal of appleCalendars) {
    updateColor.run(cal.color, cal.name, cal.color);
  }
  return newOnes.map(c => c.name);
}

// Alias fuer Abwaertskompatibilitaet mit bisherigem Aufruf in routes
export const checkNewCalendars = detectNewCalendars;

// ── Aktive Kalender-Namen bestimmen ──────────────────────────────────────────
// Falls CALENDAR_NAMES nicht gesetzt: alle bekannten Kalender aus known_calendars
// verwenden (oder als letzten Fallback alle Apple-Kalender abrufen)

async function resolveCalendarNames(): Promise<string> {
  const envNames = (process.env.CALENDAR_NAMES ?? '').trim();
  if (envNames) return envNames;

  // Fallback 1: known_calendars aus DB (schnell, kein Apple-Aufruf)
  const knownRows = db.prepare('SELECT name FROM known_calendars WHERE enabled = 1 ORDER BY name').all() as Array<{ name: string }>;
  if (knownRows.length > 0) {
    return knownRows.map(r => r.name).join(',');
  }

  // Fallback 2: Apple Calendar direkt abfragen (einmaliger Overhead)
  console.log('[calendar] CALENDAR_NAMES not set — fetching all calendars from Apple Calendar');
  const allCalendars = await listCalendars();
  // In known_calendars eintragen fuer naechstes Mal
  const insert = db.prepare('INSERT OR IGNORE INTO known_calendars (name) VALUES (?)');
  for (const cal of allCalendars) insert.run(cal.name);
  // Farben aktualisieren
  const updateColor = db.prepare('UPDATE known_calendars SET color = ? WHERE name = ? AND (color IS NULL OR color != ?)');
  for (const cal of allCalendars) {
    updateColor.run(cal.color, cal.name, cal.color);
  }
  return allCalendars.map(c => c.name).join(',');
}

// ── Pull: Apple -> SQLite ─────────────────────────────────────────────────────

export interface SyncPullResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export async function syncPull(): Promise<SyncPullResult> {
  const calNames = await resolveCalendarNames();

  if (!calNames.trim()) {
    console.warn('[calendar] No calendars configured and none found in Apple Calendar — skipping sync');
    return { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
  }

  const start = Date.now();
  const raw = await runScript('cal-read.applescript', {
    CAL_NAMES: calNames,
    DAYS_BACK,
    DAYS_FORWARD,
  });

  interface RawEvent {
    uid: string;
    title: string;
    startEpoch: number;
    endEpoch: number;
    stampEpoch: number;
    allDay: boolean;
    cal: string;
  }

  let events: RawEvent[];
  try {
    // AppleScript auf deutschem macOS formatiert große Integer als "1,7782776E+9"
    // (Komma als Dezimaltrennzeichen, kein valides JSON) — vor dem Parsen normalisieren.
    const sanitized = raw.replace(/"(startEpoch|endEpoch|stampEpoch)":([\d.,E+\-]+)(?=[,}\]])/g, (_, key, num) => {
      const clean = num.replace(/\./g, '').replace(',', '.');
      return `"${key}":${Math.round(parseFloat(clean))}`;
    });
    events = JSON.parse(sanitized);
  } catch (parseErr) {
    console.error('[calendar] syncPull: AppleScript-Output ist kein valides JSON:', parseErr);
    console.error('[calendar] Raw output (first 500 chars):', raw.slice(0, 500));
    throw new Error('AppleScript-Output konnte nicht geparst werden. Moeglicherweise enthaelt ein Event-Titel ungueltige Zeichen.');
  }
  let created = 0, updated = 0, skipped = 0, errors = 0;

  const upsert = db.prepare(`
    INSERT INTO calendar_events (apple_uid, start_at, end_at, title, is_all_day, calendar_name, apple_stamp, sync_status, last_synced_at, updated_at)
    VALUES (@uid, @start_at, @end_at, @title, @is_all_day, @calendar_name, @apple_stamp, 'synced', @now, @now)
    ON CONFLICT(apple_uid, start_at) DO UPDATE SET
      end_at        = excluded.end_at,
      title         = excluded.title,
      is_all_day    = excluded.is_all_day,
      calendar_name = excluded.calendar_name,
      apple_stamp   = excluded.apple_stamp,
      sync_status   = CASE
        WHEN sync_status IN ('pending_push','pending_delete') AND excluded.apple_stamp > apple_stamp
          THEN 'synced'
        WHEN sync_status IN ('pending_push','pending_delete')
          THEN sync_status
        ELSE 'synced'
      END,
      last_synced_at = excluded.last_synced_at,
      updated_at     = excluded.updated_at
  `);

  const logInsert = db.prepare(`
    INSERT INTO calendar_sync_log (calendar_name, event_title, apple_uid, action, direction, success, error_message)
    VALUES (?, ?, ?, ?, 'pull', ?, ?)
  `);

  // Alle in einer Transaktion fuer Performance
  const txn = db.transaction(() => {
    for (const evt of events) {
      try {
        const existing = db.prepare('SELECT id, apple_stamp FROM calendar_events WHERE apple_uid = ? AND start_at = ?')
          .get(evt.uid, epochToISO(evt.startEpoch)) as { id: number; apple_stamp: string | null } | undefined;

        const stampISO = evt.stampEpoch > 0 ? epochToISO(evt.stampEpoch) : null;

        // Gleicher Stamp -> ueberspringen (Apple gewinnt bei Konflikt — gleicher Stamp = kein Conflict)
        if (existing && existing.apple_stamp === stampISO) {
          skipped++;
          continue;
        }

        upsert.run({
          uid: evt.uid,
          start_at: epochToISO(evt.startEpoch),
          end_at: epochToISO(evt.endEpoch),
          title: evt.title,
          is_all_day: evt.allDay ? 1 : 0,
          calendar_name: evt.cal,
          apple_stamp: stampISO,
          now: new Date().toISOString(),
        });

        const action = existing ? 'updated' : 'created';
        logInsert.run(evt.cal, evt.title, evt.uid, action, 1, null);
        if (existing) updated++; else created++;
      } catch (err) {
        errors++;
        logInsert.run(evt.cal ?? '', evt.title ?? '', evt.uid ?? '', 'skipped', 0, String(err));
      }
    }
  });

  txn();

  return { created, updated, skipped, errors, durationMs: Date.now() - start };
}

// ── Full Sync: Pull + detectNewCalendars (fuer Hintergrund-Interval) ──────────

export async function fullSync(): Promise<void> {
  try {
    console.log('[calendar] Background sync starting...');
    await detectNewCalendars();
    const result = await syncPull();
    console.log(`[calendar] Background sync done — created:${result.created} updated:${result.updated} skipped:${result.skipped} errors:${result.errors} (${result.durationMs}ms)`);
  } catch (err) {
    console.error('[calendar] Background sync error:', err);
  }
}

// ── Push: SQLite-Event -> Apple Calendar ──────────────────────────────────────

export async function pushEvent(eventId: number): Promise<{ uid: string }> {
  const evt = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId) as {
    title: string; start_at: string; end_at: string; is_all_day: number;
    calendar_name: string; location: string | null;
  } | undefined;

  if (!evt) throw new Error(`Event ${eventId} not found`);

  const startEpoch = Math.floor(new Date(evt.start_at).getTime() / 1000).toString();
  const endEpoch   = Math.floor(new Date(evt.end_at).getTime() / 1000).toString();

  const uid = await runScript('cal-create.applescript', {
    CAL_NAME:        evt.calendar_name,
    EVT_TITLE:       evt.title,
    EVT_START_EPOCH: startEpoch,
    EVT_END_EPOCH:   endEpoch,
    EVT_ALLDAY:      evt.is_all_day ? 'true' : 'false',
    EVT_LOCATION:    evt.location ?? '',
  });

  db.prepare(`UPDATE calendar_events SET apple_uid = ?, sync_status = 'synced', updated_at = ? WHERE id = ?`)
    .run(uid, new Date().toISOString(), eventId);

  db.prepare(`INSERT INTO calendar_sync_log (calendar_name, event_title, apple_uid, action, direction, success) VALUES (?,?,?,'created','push',1)`)
    .run(evt.calendar_name, evt.title, uid);

  return { uid };
}

export async function updateAppleEvent(eventId: number): Promise<void> {
  const evt = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId) as {
    title: string; start_at: string; end_at: string; apple_uid: string;
    calendar_name: string; location: string | null;
  } | undefined;
  if (!evt) throw new Error(`Event ${eventId} not found`);

  const startEpoch = Math.floor(new Date(evt.start_at).getTime() / 1000).toString();
  const endEpoch   = Math.floor(new Date(evt.end_at).getTime() / 1000).toString();

  await runScript('cal-update.applescript', {
    EVT_UID:         evt.apple_uid,
    CAL_NAME:        evt.calendar_name,
    EVT_TITLE:       evt.title,
    EVT_START_EPOCH: startEpoch,
    EVT_END_EPOCH:   endEpoch,
    EVT_LOCATION:    evt.location ?? '',
  });

  db.prepare(`UPDATE calendar_events SET sync_status = 'synced', updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), eventId);
}

export async function deleteAppleEvent(eventId: number): Promise<void> {
  const evt = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId) as {
    apple_uid: string; calendar_name: string; title: string;
  } | undefined;
  if (!evt) throw new Error(`Event ${eventId} not found`);

  await runScript('cal-delete.applescript', {
    EVT_UID:  evt.apple_uid,
    CAL_NAME: evt.calendar_name,
  });

  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(eventId);
  db.prepare(`INSERT INTO calendar_sync_log (calendar_name, event_title, apple_uid, action, direction, success) VALUES (?,?,?,'deleted','push',1)`)
    .run(evt.calendar_name, evt.title, evt.apple_uid);
}
