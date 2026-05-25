-- Migration 046: Amazon Reviews — Tester-/Refund-Tracking (Phase 5)
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Alle Geld-Felder INTEGER (Cents) — Phase-4-Konvention
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

CREATE TABLE IF NOT EXISTS amazon_reviews (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name          TEXT NOT NULL,
    purchase_price_cents  INTEGER NOT NULL CHECK (purchase_price_cents > 0),
    status                TEXT NOT NULL DEFAULT 'vorgemerkt' CHECK (status IN (
                              'vorgemerkt','bestellt','erhalten','bewertet',
                              'geld_erhalten','bereit_verkauf',
                              'behalten','verkauft','verschenkt','entsorgt'
                          )),
    order_date            TEXT,
    received_date         TEXT,
    review_deadline       TEXT,
    refund_code           TEXT,
    refund_amount_cents   INTEGER,
    sale_amount_cents     INTEGER,
    notes                 TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_amazon_reviews_status          ON amazon_reviews(status);
CREATE INDEX IF NOT EXISTS idx_amazon_reviews_received_date   ON amazon_reviews(received_date);
CREATE INDEX IF NOT EXISTS idx_amazon_reviews_review_deadline ON amazon_reviews(review_deadline);
