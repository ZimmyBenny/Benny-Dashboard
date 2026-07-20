-- 123: Nachträge an receipt_files — additive Spalten + angepasster INSERT-Trigger.
-- Additiv, KEIN PRAGMA foreign_keys (migrate.ts steuert zentral), KEIN Rebuild.
ALTER TABLE receipt_files ADD COLUMN is_nachtrag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receipt_files ADD COLUMN added_by TEXT;

-- INSERT-Trigger neu: freigegebene Belege dürfen gekennzeichnete Nachträge (is_nachtrag=1)
-- annehmen; nicht-gekennzeichnete Inserts (is_nachtrag=0) bleiben blockiert.
DROP TRIGGER trg_receipt_files_no_insert_after_freigabe;
CREATE TRIGGER trg_receipt_files_no_insert_after_freigabe
BEFORE INSERT ON receipt_files
FOR EACH ROW
WHEN (SELECT freigegeben_at FROM receipts WHERE id = NEW.receipt_id) IS NOT NULL
     AND NEW.is_nachtrag = 0
BEGIN
    SELECT RAISE(ABORT, 'GoBD: An einen freigegebenen Beleg dürfen nur gekennzeichnete Nachträge angefügt werden.');
END;
