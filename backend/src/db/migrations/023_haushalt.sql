-- Haushalt-Modul: Gemeinsame Ausgabenverwaltung (Benny & Julia)
-- haushalt_abrechnungen ZUERST, da haushalt_eintraege darauf referenziert

CREATE TABLE IF NOT EXISTS haushalt_abrechnungen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titel TEXT NOT NULL,
  datum TEXT NOT NULL,
  ausgleich_betrag REAL NOT NULL,
  notiz TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS haushalt_eintraege (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  datum TEXT NOT NULL,
  betrag REAL NOT NULL,
  beschreibung TEXT NOT NULL,
  kategorie TEXT NOT NULL CHECK (kategorie IN ('Einkäufe','Kind','Haushalt','Freizeit','Urlaub','Nebenkosten','Miete','Sonstiges')),
  bezahlt_von TEXT NOT NULL CHECK (bezahlt_von IN ('benny','julia')),
  eintrag_typ TEXT NOT NULL DEFAULT 'ausgabe' CHECK (eintrag_typ IN ('ausgabe','geldübergabe')),
  aufteilung_prozent REAL NOT NULL DEFAULT 50,
  zahlungsart TEXT CHECK (zahlungsart IN ('cash','überweisung','offen') OR zahlungsart IS NULL),
  zeitraum_von TEXT,
  zeitraum_bis TEXT,
  abrechnung_id INTEGER REFERENCES haushalt_abrechnungen(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
