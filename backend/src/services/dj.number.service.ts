import db from '../db/connection';

/**
 * Vergibt die nächste Nummer aus einem Nummernkreis.
 * Atomar in einer Transaktion — kein Race Condition möglich.
 * Wird NUR beim Finalisieren aufgerufen, nicht beim Anlegen.
 */
export function nextNumber(key: 'invoice' | 'quote' | 'credit_note'): string {
  const getNext = db.transaction(() => {
    const row = db
      .prepare('SELECT prefix, current_value, padding FROM dj_number_sequences WHERE key = ?')
      .get(key) as { prefix: string; current_value: number; padding: number } | undefined;

    if (!row) throw new Error(`Nummernkreis '${key}' nicht gefunden`);

    const next = row.current_value + 1;
    db.prepare(
      "UPDATE dj_number_sequences SET current_value = ?, updated_at = datetime('now') WHERE key = ?"
    ).run(next, key);

    return row.prefix
      ? `${row.prefix}-${String(next).padStart(row.padding, '0')}`
      : String(next);
  });

  return getNext();
}

export function currentNumber(key: 'invoice' | 'quote' | 'credit_note'): string {
  const row = db
    .prepare('SELECT prefix, current_value, padding FROM dj_number_sequences WHERE key = ?')
    .get(key) as { prefix: string; current_value: number; padding: number } | undefined;

  if (!row) throw new Error(`Nummernkreis '${key}' nicht gefunden`);
  return row.prefix
    ? `${row.prefix}-${String(row.current_value).padStart(row.padding, '0')}`
    : String(row.current_value);
}
