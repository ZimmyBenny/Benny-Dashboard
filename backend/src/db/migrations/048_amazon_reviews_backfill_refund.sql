-- Migration 048: Backfill refund_amount_cents fuer bestehende Reviews (User-Decision 2026-05-26)
-- Items in Stati ab 'geld_erhalten' haben semantisch den Refund erhalten.
-- Falls refund_amount_cents NULL ist -> setze es auf den Kaufpreis (volle Erstattung Default).
-- User kann das im Detail-Modal spaeter korrigieren falls Teil-Refund.
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

UPDATE amazon_reviews
SET refund_amount_cents = purchase_price_cents,
    updated_at = datetime('now')
WHERE refund_amount_cents IS NULL
  AND status IN ('geld_erhalten','bereit_verkauf','behalten','verkauft','verschenkt','entsorgt');
