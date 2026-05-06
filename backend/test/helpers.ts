import type Database from 'better-sqlite3';

export interface AuditEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  old_value: string | null;
  new_value: string | null;
  actor: string | null;
  created_at: string;
}

export function expectAuditEntry(
  db: Database.Database,
  entityType: string,
  entityId: number,
  action: string
): AuditEntry {
  const row = db.prepare(`
    SELECT * FROM audit_log
    WHERE entity_type = ? AND entity_id = ? AND action = ?
    ORDER BY id DESC LIMIT 1
  `).get(entityType, entityId, action) as AuditEntry | undefined;
  if (!row) {
    throw new Error(`No audit entry for ${entityType}#${entityId} action=${action}`);
  }
  return row;
}
