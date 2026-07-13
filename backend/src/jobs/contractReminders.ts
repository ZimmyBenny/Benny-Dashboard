import db from '../db/connection';
import { todayLocal, addDaysLocal } from '../lib/dates';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface ContractRow {
  id: number;
  title: string;
  cost_interval: string | null;
  start_date: string | null;
  reminder_date: string | null;
  cancellation_notice_weeks: number | null;
  last_reminded_for: string | null;
}

/** Schritte in Monaten je Kündigungs-relevantem Intervall. */
const INTERVAL_STEP_MONTHS: Record<string, number> = {
  monatlich: 1,
  quartalsweise: 3,
  jaehrlich: 12,
};

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function formatYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Addiert `months` Monate zu einem Y/M/D-Tupel, Tag wird auf das Monatsende geklammert (z.B. 31.01. + 1 Monat -> 28./29.02.). */
function addMonthsClamped(start: { y: number; m: number; d: number }, months: number): { y: number; m: number; d: number } {
  const totalM = start.y * 12 + (start.m - 1) + months;
  const ny = Math.floor(totalM / 12);
  const nm = (totalM % 12) + 1;
  const daysInMonth = new Date(ny, nm, 0).getDate();
  const nd = Math.min(start.d, daysInMonth);
  return { y: ny, m: nm, d: nd };
}

/** Vorlauf: so viele Tage VOR dem Kuendigungs-Stichtag erscheint die Aufgabe. */
const REMINDER_LEAD_DAYS = 28;

/**
 * Berechnet das naechste noch handhabbare Kuendigungs-Fenster fuer ein
 * Zahlungsintervall, ausgehend vom start_date:
 *
 *  - due:      naechster Verlaengerungstermin. Fruehestens EIN Intervall nach
 *              dem Startdatum — das Startdatum selbst ist kein
 *              Verlaengerungstermin (ein Vertrag, der erst noch beginnt,
 *              kann nicht "zum Start" gekuendigt werden).
 *  - remindAt: letzter Kuendigungs-Stichtag (due minus Kuendigungsfrist).
 *              Liegt der Stichtag eines Zyklus bereits in der Vergangenheit
 *              (Frist verpasst), wird auf den naechsten Zyklus gesprungen —
 *              es entsteht nie eine rueckdatierte Erinnerung.
 */
export function computeNextCancelWindow(
  startDate: string,
  today: string,
  interval: string,
  noticeWeeks: number,
): { due: string; remindAt: string } | null {
  const step = INTERVAL_STEP_MONTHS[interval];
  if (!step) return null;
  const start = parseYMD(startDate);
  // Sicherheits-Obergrenze (100 Jahre in Monatsschritten reichen für jedes Intervall).
  const maxIter = Math.ceil((100 * 12) / step);
  for (let i = 1; i <= maxIter; i++) {
    const occ = addMonthsClamped(start, i * step);
    const due = formatYMD(occ.y, occ.m, occ.d);
    const remindAt = addDaysLocal(due, -(noticeWeeks * 7));
    if (remindAt >= today) return { due, remindAt };
  }
  return null;
}

function formatDeadlineDe(isoDate: string): string {
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/**
 * Reminder-Job (erweitert, Plan quick-260702-vz7 Feature 3):
 *
 * 1. Ist am Vertrag ein `reminder_date` gesetzt, gilt dieses als Override —
 *    der Job erinnert daran statt an ein selbst berechnetes Datum.
 * 2. Ohne `reminder_date` wird fuer monatlich/quartalsweise/jaehrlich das
 *    naechste handhabbare Kuendigungs-Fenster berechnet (siehe
 *    computeNextCancelWindow): Stichtag = Verlaengerung minus
 *    `cancellation_notice_weeks`; verpasste Stichtage springen auf den
 *    naechsten Zyklus, die Aufgabe erscheint REMINDER_LEAD_DAYS vor dem
 *    Stichtag mit due_date = Stichtag — nie rueckdatiert.
 * 3. `einmalig` ohne `reminder_date` (oder fehlendes start_date) -> keine Erinnerung.
 *
 * Bestehendes Verhalten fuer jaehrliche Auto-Renew-Vertraege bleibt kompatibel —
 * einziger inhaltlicher Unterschied ist, dass `cancellation_notice_weeks`
 * statt der hartkodierten 56-Tage-Konstante greift.
 */
function runContractReminderPass(): void {
  // Lokales Datum verwenden — wenn der Cron-Job nachts laeuft, waere
  // UTC-`now` der Vortag und alle Vergleiche/Berechnungen verschoben.
  const today = todayLocal(); // 'YYYY-MM-DD'

  const rows = db.prepare(`
    SELECT id, title, cost_interval, start_date, reminder_date, cancellation_notice_weeks, last_reminded_for
    FROM contracts_and_deadlines
    WHERE status = 'aktiv' AND is_archived = 0
  `).all() as ContractRow[];

  let created = 0;

  for (const row of rows) {
    let effectiveReminder: string | null = null;
    let deadlineForMessage: string | null = null;

    if (row.reminder_date) {
      // Override: gesetztes reminder_date gewinnt.
      effectiveReminder = row.reminder_date;
      deadlineForMessage = row.reminder_date;
      if (today < effectiveReminder) continue; // Fenster noch nicht offen
    } else if (
      row.cost_interval &&
      INTERVAL_STEP_MONTHS[row.cost_interval] !== undefined &&
      row.start_date
    ) {
      const weeks = row.cancellation_notice_weeks ?? 4;
      const win = computeNextCancelWindow(row.start_date, today, row.cost_interval, weeks);
      if (!win) continue;
      effectiveReminder = win.remindAt;
      // Aufgabe erscheint mit Vorlauf VOR dem Stichtag (nicht erst am letzten Tag).
      if (today < addDaysLocal(win.remindAt, -REMINDER_LEAD_DAYS)) continue;
      deadlineForMessage = win.due;
    } else {
      // einmalig ohne reminder_date, oder start_date fehlt -> keine Erinnerung.
      continue;
    }

    // Schon einmal fuer genau diese Frist erinnert? Dann NICHT neu erzeugen — auch wenn
    // der Nutzer die Aufgabe geloescht hat (sonst kommt sie bei jedem Job-Lauf zurueck).
    if (row.last_reminded_for === effectiveReminder) continue;

    const taskTitle = `Vertrag kündbar: ${row.title}`;
    const existing = db.prepare(
      `SELECT id FROM tasks WHERE title LIKE ? AND due_date = ? LIMIT 1`
    ).get(`${taskTitle}%`, effectiveReminder) as { id?: number } | undefined;
    if (existing?.id) {
      // Aufgabe existiert bereits -> Frist als 'erinnert' vormerken, damit ein spaeteres
      // Loeschen der Aufgabe sie nicht bei jedem Lauf neu erzeugt.
      db.prepare(`UPDATE contracts_and_deadlines SET last_reminded_for = ? WHERE id = ?`).run(effectiveReminder, row.id);
      continue;
    }

    const deadlineFormatted = deadlineForMessage ? formatDeadlineDe(deadlineForMessage) : '—';

    const description =
      `Kündigungsfrist/Fälligkeit läuft ab am ${deadlineFormatted}. ` +
      `Jetzt handeln oder Vertrag bewusst weiterlaufen lassen.\n\n` +
      `(Automatisch erstellt vom Verträge-Reminder-Job · contract_id=${row.id})`;

    db.prepare(`
      INSERT INTO tasks (
        title, description, status, priority,
        due_date, reminder_at, has_reminder
      ) VALUES (?, ?, 'open', 'high', ?, ?, 1)
    `).run(taskTitle, description, effectiveReminder, effectiveReminder);

    // Frist als 'erinnert' vormerken -> genau EINE Erinnerung pro Frist.
    db.prepare(`UPDATE contracts_and_deadlines SET last_reminded_for = ? WHERE id = ?`).run(effectiveReminder, row.id);
    created++;
  }

  if (created > 0) {
    console.log(`[contracts-cron] ${created} Kündigungs-Aufgabe(n) erstellt`);
  }
}

export function startContractReminderJob(): void {
  // Einmal sofort (nach kurzer Verzögerung, damit Server voll ready ist)
  setTimeout(() => {
    try { runContractReminderPass(); }
    catch (err) { console.error('[contracts-cron] Startup run failed:', err); }
  }, 5_000);

  // Alle 24 Stunden
  setInterval(() => {
    try { runContractReminderPass(); }
    catch (err) { console.error('[contracts-cron] Scheduled run failed:', err); }
  }, ONE_DAY_MS);

  console.log('[contracts-cron] Reminder-Job aktiv: sofort + alle 24h');
}
