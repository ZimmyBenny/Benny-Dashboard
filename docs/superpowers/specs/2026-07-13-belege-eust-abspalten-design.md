# Belege: Einfuhrumsatzsteuer abspalten

**Datum:** 2026-07-13 · **Status:** Von Benny freigegeben

## Problem

Gemischte Zollrechnungen (z. B. DHL Express Import) enthalten zwei steuerlich
unterschiedliche Teile: den **Service-Anteil mit 19 % USt** (Zollgebühren, Lagerung)
und die **Einfuhrumsatzsteuer (EUSt) mit 0 %** (die verauslagte Import-USt selbst).
Das Beleg-Formular kann aktuell nur Brutto + einen einzigen USt-Satz → daraus
Netto/USt automatisch. Damit lässt sich so eine Rechnung nicht korrekt erfassen
(19 % auf den Gesamtbetrag ergibt eine falsche USt).

Beispiel DHL ZIT7819041: Brutto 165,85 € = Service 146,19 € (netto 122,85 + 23,34 USt)
**+ EUSt 19,66 €** (0 %). Gesamt-Netto 142,51 / USt 23,34.

## Architektur-Erkenntnis (bestimmt das Design)

Die UStVA-Berechnung (`taxCalcService.ts`) modelliert EUSt bereits als **eigenen
Beleg**:
- **KZ 62** (Einfuhrumsatzsteuer) summiert `amount_gross_cents` aller Belege mit
  `import_eust = 1` (der ganze Brutto-Betrag = gezahlte EUSt).
- **KZ 66** (normale Vorsteuer) schließt `import_eust = 1` explizit aus.

Ein „davon-EUSt"-Feld INNERHALB eines Belegs würde beide Kennzahlen aushebeln
(Doppel-/Falschzählung). Deshalb: **Auto-Split in zwei verknüpfte Belege** — die
bestehende UStVA-Logik bleibt unverändert und damit garantiert korrekt.

## Geklärte Anforderungen

- **Auto-Split** (Frage 1: A): eine Eingabe → System legt EUSt-Beleg automatisch an.
- **Feld + Button** (Frage 2: A): explizit ausgelöst, nicht automatisch beim Speichern.

## Datenmodell (Migration 122, additiv)

```sql
ALTER TABLE receipts ADD COLUMN eust_parent_receipt_id INTEGER
  REFERENCES receipts(id) ON DELETE SET NULL;
```

Verknüpft den abgespaltenen EUSt-Beleg (Kind) mit seinem Ursprungs-Beleg (Eltern).
Kein PRAGMA foreign_keys in der Migration (zentral in migrate.ts). Kein Rebuild.

## Backend

**`POST /api/belege/:id/split-eust`** — Body `{ eust_cents: number }`. In einer
`db.transaction`:
1. Validieren:
   - Beleg existiert und ist **nicht freigegeben** (`freigegeben_at IS NULL`), sonst 409.
   - `eust_cents > 0` und `eust_cents < amount_gross_cents`, sonst 400.
   - Noch kein Kind vorhanden (kein receipt mit `eust_parent_receipt_id = :id`), sonst 409.
2. **Ursprungs-Beleg reduzieren:** `amount_gross_cents -= eust_cents`; Netto/USt beim
   bestehenden `vat_rate` neu berechnen (calcNetCents-Muster wie receiptService).
3. **EUSt-Beleg anlegen** (über bestehenden receiptService/insert-Pfad):
   - `type='beleg'`, `import_eust=1`, `vat_rate=0`,
     `amount_gross_cents=eust_cents`, `amount_net_cents=eust_cents`, `vat_amount_cents=0`,
     `input_tax_deductible=1`, `steuerrelevant=1`,
     `tax_category_id` = ID von „EUSt/Zoll" (Lookup per Name, Fallback null),
     `eust_parent_receipt_id = :id`, `status` = Status des Originals,
     erbt `supplier_name`, `receipt_date`, `due_date`, `payment_date`, `currency`, `title`
     (Titel-Präfix „Einfuhrumsatzsteuer — …").
   - **Datei:** verweist auf DIESELBE Datei wie das Original (receipt_files-Verknüpfung
     kopieren; die physische PDF wird NICHT dupliziert — beide Belege zeigen dasselbe
     Dokument. Umsetzung entlang des bestehenden receipt_files-Modells).
   - **Bereich:** area_links des Originals übernehmen (POST /:id/areas-Muster / direkter
     Insert in receipt_area_links).
4. Aktivitäts-/Audit-Log an beiden Belegen.
5. Rückgabe: beide Belege (Original aktualisiert + neuer EUSt-Beleg).

**`POST /api/belege/:id/merge-eust`** (Rückgängig) — nur wenn weder Eltern noch Kind
freigegeben. Löscht den EUSt-Kind-Beleg (dessen `eust_parent_receipt_id = :id`),
addiert dessen Brutto zurück auf den Eltern-Beleg (Netto/USt neu berechnen),
Aktivitäts-Log. Physische Datei bleibt (gehört dem Original).

GET-Antwort eines Belegs wird um `eust_parent_receipt_id` und (für den Eltern-Beleg)
ein abgeleitetes `eust_child` (id + Betrag, falls vorhanden) erweitert.

Einzel-Operation auf einem Beleg → kein createBackup nötig (CLAUDE.md-Regel).

## Frontend (BelegeDetailPage, Bereich „Beträge")

Sichtbar nur wenn `!isLocked`:
- **Wenn noch kein EUSt-Kind existiert:** Feld „davon Einfuhrumsatzsteuer (€)" (money)
  + Button „EUSt abspalten". Button aktiv wenn Betrag > 0 und < Brutto. Ruft
  `POST /split-eust`, invalidiert Belege-Queries.
- **Wenn ein EUSt-Kind existiert:** Info-Zeile „‹Betrag› € EUSt als verknüpften Beleg
  abgespalten →" (klickbar → navigiert zum Kind-Beleg) + Button „Zusammenführen"
  (`POST /merge-eust`).
- **Am EUSt-Kind-Beleg** (`eust_parent_receipt_id` gesetzt): oben ein Abzeichen
  „Einfuhrumsatzsteuer" + Rück-Link „gehört zu ‹Lieferant › Rechnungsnr.› →".

Echte Umlaute; Löschen/Zusammenführen mit Bestätigungs-Rückfrage.

## Verifikation

Am echten DHL-Beleg (id 135, ZIT7819041): EUSt 1966 Cent abspalten →
Original 14619 Brutto / 12285 Netto / 2334 USt; EUSt-Beleg 1966 Brutto,
import_eust=1, vat_rate=0. Danach UStVA-Zahlen (KZ 62 = 19,66; KZ 66 enthält 23,34,
nicht 26,48) gegenprüfen. Zusammenführen → Original wieder 16585.

## Nicht im Scope

- Mehrere EUSt-Zeilen pro Beleg (bei Zollrechnungen immer genau eine)
- Automatische EUSt-Erkennung per OCR
- Rückwirkende Migration bestehender falsch erfasster Belege
