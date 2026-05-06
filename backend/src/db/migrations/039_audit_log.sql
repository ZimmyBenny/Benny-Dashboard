-- ============================================================================
-- Migration 039: Generisches audit_log
-- Ersetzt dj_audit_log fuer die gesamte App.
-- dj_audit_log bleibt vorerst erhalten (Datenmigration via INSERT, kein DROP).
-- DROP TABLE dj_audit_log erfolgt in spaeterer Migration nach Verifikations-Stabilitaet.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    action      TEXT NOT NULL,
    field_name  TEXT,
    old_value   TEXT,
    new_value   TEXT,
    actor       TEXT,
    user_id     INTEGER,
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_date   ON audit_log(created_at);

CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Audit-Log darf nicht verändert werden.');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Audit-Log-Einträge dürfen nicht gelöscht werden.');
END;

-- Datenmigration aus dj_audit_log (INSERT only, OHNE id-Spalte → neue IDs)
-- Idempotenz: Migration 039 wird nur einmal angewandt (migrate.ts trackt via _migrations);
-- bei Re-Run wuerde dieser INSERT trotzdem nochmal feuern → Schutz via NOT EXISTS.
INSERT INTO audit_log
  (entity_type, entity_id, action, old_value, new_value,
   actor, user_id, ip_address, user_agent, created_at)
SELECT
  entity_type, entity_id, action, old_value, new_value,
  user_name, user_id, ip_address, user_agent, created_at
FROM dj_audit_log
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log al
  WHERE al.entity_type = dj_audit_log.entity_type
    AND al.entity_id = dj_audit_log.entity_id
    AND al.action = dj_audit_log.action
    AND al.created_at = dj_audit_log.created_at
);
