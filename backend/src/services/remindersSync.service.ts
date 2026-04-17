import { execFile } from 'child_process';
import db from '../db/connection';

// ── Sync-Mutex ────────────────────────────────────────────────────────────────
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
  notes: string | null;
}

// ── AppleScript-Snippets ──────────────────────────────────────────────────────
//
// Wir nutzen klassisches AppleScript (nicht JXA) — stabiler für Reminders.
// Ausgabe als Tab-getrennte Zeilen, die Node.js parst.
// Format pro Zeile: id \t title \t listName \t dueDate \t notes
// Fehlende Felder werden als leerer String ausgegeben.

const AS_LIST = `
with timeout of 45 seconds
tell application "Reminders"
  set output to ""
  repeat with aList in lists
    set listName to name of aList
    try
      repeat with r in (every reminder in aList)
        if completed of r is false then
          set rId to id of r
          set rTitle to name of r as string
          -- Zeilenumbrüche im Titel → erste Zeile (Rest in Notes)
          set AppleScript's text item delimiters to linefeed
          set rTitle to text item 1 of rTitle
          set AppleScript's text item delimiters to ""
          set rNotes to ""
          try
            set rNotes to body of r as string
          end try
          set rDue to ""
          try
            set d to due date of r
            if d is not missing value then
              set rDue to ((year of d) as string) & "-" & text -2 thru -1 of ("0" & (month of d as integer as string)) & "-" & text -2 thru -1 of ("0" & (day of d as string))
            end if
          end try
          set output to output & rId & tab & rTitle & tab & listName & tab & rDue & tab & rNotes & linefeed
        end if
      end repeat
    end try
  end repeat
  return output
end tell
end timeout
`;

function buildAsComplete(uid: string): string {
  return `
tell application "Reminders"
  repeat with aList in lists
    repeat with r in (every reminder in aList)
      if id of r is "${uid.replace(/"/g, '\\"')}" then
        set completed of r to true
        return "ok"
      end if
    end repeat
  end repeat
  return "not found"
end tell
`;
}

// ── osascript-Wrapper (AppleScript-Modus) ─────────────────────────────────────

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', script],
      { timeout: 90_000, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (stderr.trim()) console.error('[reminders] osascript stderr:', stderr.trim());
        if (err) return reject(new Error(stderr.trim() || err.message));
        resolve(stdout);
      }
    );
  });
}

// ── TSV-Parser ────────────────────────────────────────────────────────────────

function parseTsv(raw: string): RawReminder[] {
  return raw
    .split('\n')
    .map(l => l.trimEnd())
    .filter(l => l.length > 0)
    .map(line => {
      const [id = '', title = '', listName = '', dueDate = '', notes = ''] = line.split('\t');
      return {
        id: id.trim(),
        title: title.trim(),
        listName: listName.trim(),
        dueDate: dueDate.trim() || null,
        reminderDate: null,
        notes: notes.trim() || null,
      };
    })
    .filter(r => r.id.startsWith('x-apple-reminder://'));
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

    console.log('[reminders] starte AppleScript-Sync...');
    const tsv = await runAppleScript(AS_LIST);
    const raw = parseTsv(tsv);
    console.log(`[reminders] AppleScript fertig: ${raw.length} offene Erinnerungen`);

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
          r.listName || null,
          r.dueDate || null,
          r.reminderDate || null,
          r.notes || null,
          syncStartTime,
        );
      }
    });
    txn();

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
  const result = await runAppleScript(buildAsComplete(appleUid));
  if (result.trim() === 'not found') {
    throw new Error(`Reminder not found: ${appleUid}`);
  }
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
