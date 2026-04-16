import db from '../db/connection';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface ContractRow {
  id: number;
  title: string;
  next_anniversary_date: string | null;
  reminder_date: string | null;
  cancellation_deadline: string | null;
  days_to_anniversary: number | null;
}

function runContractReminderPass(): void {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  const rows = db.prepare(`
    SELECT
      id, title,
      CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
        date(
          CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
            THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
            ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END
        )
      ELSE NULL END AS next_anniversary_date,
      CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
        date(
          CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
            THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
            ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
          '-56 days')
      ELSE NULL END AS reminder_date,
      CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
        date(
          CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
            THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
            ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
          '-' || (cancellation_notice_weeks * 7) || ' days')
      ELSE NULL END AS cancellation_deadline,
      CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
        CAST(julianday(
          date(
            CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
              THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
              ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END
          )
        ) - julianday(date('now')) AS INTEGER)
      ELSE NULL END AS days_to_anniversary
    FROM contracts_and_deadlines
    WHERE auto_renews = 1
      AND cost_interval = 'jaehrlich'
      AND start_date IS NOT NULL
      AND status = 'aktiv'
      AND is_archived = 0
  `).all() as ContractRow[];

  let created = 0;

  for (const row of rows) {
    if (!row.reminder_date || !row.next_anniversary_date || row.days_to_anniversary == null) continue;
    // Fenster offen? heute >= reminder_date UND heute < anniversary
    if (row.reminder_date > today) continue;             // Fenster noch nicht offen
    if (row.next_anniversary_date <= today) continue;    // Anniversary schon vorbei — dieses Jahr nicht mehr

    const taskTitle = `Vertrag kündbar: ${row.title}`;
    const existing = db.prepare(
      `SELECT id FROM tasks WHERE title LIKE ? AND due_date = ? LIMIT 1`
    ).get(`${taskTitle}%`, row.reminder_date) as { id?: number } | undefined;
    if (existing?.id) continue; // Duplikat

    const deadlineFormatted = row.cancellation_deadline
      ? (() => { const d = new Date(row.cancellation_deadline!); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; })()
      : '—';

    const description =
      `Kündigungsfrist läuft ab am ${deadlineFormatted}. ` +
      `Jetzt handeln oder Vertrag bewusst weiterlaufen lassen.\n\n` +
      `(Automatisch erstellt vom Verträge-Reminder-Job · contract_id=${row.id})`;

    db.prepare(`
      INSERT INTO tasks (
        title, description, status, priority,
        due_date, reminder_at, has_reminder
      ) VALUES (?, ?, 'open', 'high', ?, ?, 1)
    `).run(taskTitle, description, row.reminder_date, row.reminder_date);

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
