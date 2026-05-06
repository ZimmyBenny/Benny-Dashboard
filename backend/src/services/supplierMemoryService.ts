/**
 * Lieferanten-Lerngedaechtnis (supplier_memory).
 *
 * Bei jedem Beleg-Speichern mit Lieferant + Area + Tax-Kategorie wird das
 * Tripel in `supplier_memory` gemerkt (UPSERT mit usage_count++). Beim
 * naechsten Upload mit demselben Lieferanten kann die UI den Vorschlag
 * automatisch vorbelegen.
 *
 * Schema (Migration 040_belege.sql):
 *   supplier_memory(id, supplier_normalized, area_id, tax_category_id,
 *                   usage_count, last_used, created_at,
 *                   UNIQUE(supplier_normalized, area_id, tax_category_id))
 *
 * Normalisierung: lib/filenames.sanitizeForFilename — Umlaute → ae/oe/ue/ss,
 * lowercase, Slug ([a-z0-9-]). Damit ist 'Thomann GmbH' == 'thomann gmbh' ==
 * 'Thomann-GmbH' == 'thomann-gmbh'. 60 Zeichen Limit reicht fuer
 * Lieferanten-Namen.
 *
 * SQL-Injection-Schutz: alle Querys verwenden parametrisierte Placeholder.
 */

import db from '../db/connection';
import { sanitizeForFilename } from '../lib/filenames';

export interface SupplierSuggestion {
  supplier_normalized: string;
  area_id: number | null;
  tax_category_id: number | null;
  usage_count: number;
  last_used: string;
}

/**
 * Normalisiert einen Lieferanten-Anzeigenamen zu einem stabilen Lookup-Key.
 *
 * Verwendet sanitizeForFilename(60) — selbe Funktion wie fuer Belege-
 * Filenames; das stellt sicher, dass derselbe Lieferant in supplier_memory
 * und im Datei-Pfad denselben Slug erhaelt.
 *
 * Liefert "" bei leerem oder nur-whitespace-Input → suggest/recordUsage
 * skippen in dem Fall.
 */
export function normalize(supplierName: string): string {
  if (!supplierName) return '';
  return sanitizeForFilename(supplierName, 60);
}

/**
 * Liefert den besten Vorschlag (area_id, tax_category_id) fuer einen
 * Lieferanten oder null wenn kein Memory existiert.
 *
 * Sortier-Strategie: ORDER BY usage_count DESC, last_used DESC, id DESC
 * — der haeufigste Tripel gewinnt; bei Gleichstand das juengste
 * (verhindert dass eine alte Falsch-Eingabe ewig kleben bleibt).
 */
export function suggest(supplierName: string): SupplierSuggestion | null {
  const norm = normalize(supplierName);
  if (!norm) return null;
  const r = db
    .prepare(
      `
      SELECT supplier_normalized, area_id, tax_category_id, usage_count, last_used
      FROM supplier_memory
      WHERE supplier_normalized = ?
      ORDER BY usage_count DESC, last_used DESC, id DESC
      LIMIT 1
    `,
    )
    .get(norm) as SupplierSuggestion | undefined;
  return r ?? null;
}

/**
 * Inkrementiert (oder legt an) den Memory-Eintrag fuer (supplier, area, tax).
 *
 * UPSERT-Logik:
 *  - Wenn ein Eintrag mit (supplier_normalized, area_id, tax_category_id)
 *    existiert (NULL-safe via IS) → usage_count++, last_used = jetzt.
 *  - Sonst INSERT mit usage_count=1.
 *
 * Skipt silently bei leerem Lieferanten-Namen (verhindert dass ein leerer
 * Slug ein Memory belegt).
 *
 * NULL-safe-WHERE: SQLite `=` ist NICHT NULL-safe (NULL = NULL → NULL).
 * Wir nutzen `IS` um NULLs gleichzusetzen — `area_id IS ?` matched sowohl
 * NULL als auch konkrete Werte (better-sqlite3 bindet null als SQL NULL).
 */
export function recordUsage(
  supplierName: string,
  areaId: number | null,
  taxCategoryId: number | null,
): void {
  const norm = normalize(supplierName);
  if (!norm) return;

  const existing = db
    .prepare(
      `
      SELECT id FROM supplier_memory
      WHERE supplier_normalized = ?
        AND area_id IS ?
        AND tax_category_id IS ?
      LIMIT 1
    `,
    )
    .get(norm, areaId, taxCategoryId) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `
      UPDATE supplier_memory
      SET usage_count = usage_count + 1,
          last_used = datetime('now')
      WHERE id = ?
    `,
    ).run(existing.id);
  } else {
    db.prepare(
      `
      INSERT INTO supplier_memory
        (supplier_normalized, area_id, tax_category_id, usage_count, last_used)
      VALUES (?, ?, ?, 1, datetime('now'))
    `,
    ).run(norm, areaId, taxCategoryId);
  }
}

/** Bundle-Export fuer komfortable Verwendung in Routes/Hooks. */
export const supplierMemoryService = {
  suggest,
  recordUsage,
  normalize,
};
