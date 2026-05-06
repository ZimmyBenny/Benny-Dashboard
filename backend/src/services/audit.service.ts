import db from '../db/connection';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';

export type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'finalize' | 'send' | 'cancel' | 'pay'
  | 'accept' | 'reject' | 'convert_to_invoice'
  | 'deactivate'
  | 'freigeben' | 'ocr_apply' | 'mirror_sync';

export type AuditEntityType =
  | 'invoice' | 'quote' | 'customer' | 'payment'
  | 'expense' | 'service' | 'package' | 'settings' | 'event'
  | 'receipt' | 'receipt_file' | 'area' | 'tax_category' | 'trip' | 'app_setting';

/**
 * Schreibt einen Audit-Log-Eintrag in audit_log.
 * GoBD-konform: append-only, DB-Trigger blockt UPDATE/DELETE.
 * Signatur ist API-kompatibel zum bisherigen DJ-Audit-Service — Bestandsaufrufe funktionieren weiter.
 */
export function logAudit(
  req: Request,
  entityType: AuditEntityType,
  entityId: number,
  action: AuditAction,
  oldValue?: unknown,
  newValue?: unknown,
): void {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id ?? null;
  const userName = authReq.user?.username ?? null;

  db.prepare(`
    INSERT INTO audit_log
      (entity_type, entity_id, action, actor, user_id, old_value, new_value, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entityType,
    entityId,
    action,
    userName,
    userId,
    oldValue !== undefined ? JSON.stringify(oldValue) : null,
    newValue !== undefined ? JSON.stringify(newValue) : null,
    req.ip ?? null,
    req.headers['user-agent'] ?? null,
  );
}
