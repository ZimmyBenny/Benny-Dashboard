import db from '../db/connection';

/**
 * Duplikat-Erkennung für Belege.
 *
 * Zwei Strategien:
 *  - SHA-256: 100% sicher (gleiche Datei = gleicher Hash). Wird beim Upload
 *    in receiptService.create geprüft.
 *  - Heuristik: gleicher Lieferant (case-insensitive), gleiche
 *    Belegnummer, gleiches Datum → wahrscheinlich Duplikat (manueller
 *    Re-Upload mit veränderter Datei). Limit 5 Treffer für UI-Warnung.
 */

export interface DuplicateCandidate {
  id: number;
  supplier_name: string | null;
  supplier_invoice_number: string | null;
  receipt_date: string;
  amount_gross_cents: number;
  file_hash_sha256: string | null;
}

/**
 * Sucht einen Beleg mit gegebenem SHA-256-Hash.
 * Liefert null bei leerem Input oder kein Treffer.
 */
export function findBySha256(sha: string): DuplicateCandidate | null {
  if (!sha) return null;
  const r = db
    .prepare(
      `
      SELECT id, supplier_name, supplier_invoice_number, receipt_date,
             amount_gross_cents, file_hash_sha256
      FROM receipts
      WHERE file_hash_sha256 = ?
    `,
    )
    .get(sha) as DuplicateCandidate | undefined;
  return r ?? null;
}

/**
 * Heuristik-Suche: Lieferant (lowercase) + Belegnummer + Datum.
 * Liefert leeres Array wenn ein Argument null/leer ist.
 * Limit: 5 Treffer.
 */
export function findByHeuristic(
  supplier: string | null,
  invoiceNumber: string | null,
  date: string | null,
): DuplicateCandidate[] {
  if (!supplier || !invoiceNumber || !date) return [];
  return db
    .prepare(
      `
      SELECT id, supplier_name, supplier_invoice_number, receipt_date,
             amount_gross_cents, file_hash_sha256
      FROM receipts
      WHERE LOWER(supplier_name) = LOWER(?)
        AND supplier_invoice_number = ?
        AND receipt_date = ?
      LIMIT 5
    `,
    )
    .all(supplier, invoiceNumber, date) as DuplicateCandidate[];
}

export const duplicateCheckService = { findBySha256, findByHeuristic };
