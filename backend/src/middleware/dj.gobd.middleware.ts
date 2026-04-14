import type { Request, Response, NextFunction } from 'express';
import db from '../db/connection';

/**
 * GoBD-Guard Middleware.
 * Blockt schreibende Zugriffe auf finalisierte Rechnungen und deren Positionen.
 *
 * Verwendung:
 *   router.patch('/invoices/:id', gobdGuardInvoice, handler)
 *   router.delete('/invoices/:id', gobdGuardInvoice, handler)
 */
export function gobdGuardInvoice(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  const dbId = Number(id);

  if (!Number.isInteger(dbId)) {
    res.status(400).json({ error: 'Ungültige Rechnungs-ID' });
    return;
  }

  const row = db
    .prepare('SELECT finalized_at FROM dj_invoices WHERE id = ?')
    .get(dbId) as { finalized_at: string | null } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }

  if (row.finalized_at) {
    res.status(409).json({
      error: 'GoBD: Finalisierte Rechnung darf nicht verändert werden. Erstelle eine Stornorechnung.',
      finalized_at: row.finalized_at,
    });
    return;
  }

  next();
}

/**
 * Prüft ob eine Rechnung finalisiert ist — als Hilfsfunktion für Service-Layer.
 */
export function isInvoiceFinalized(invoiceId: number): boolean {
  const row = db
    .prepare('SELECT finalized_at FROM dj_invoices WHERE id = ?')
    .get(invoiceId) as { finalized_at: string | null } | undefined;
  return !!row?.finalized_at;
}
