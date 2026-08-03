# Zoll-Abspalten für gemischte Zollrechnungen (Belege)

**Datum:** 2026-07-31 · **Status:** Von Benny freigegeben

## Ziel

Analog zum EUSt-Abspalten (Migr. 122) einen „Zoll abspalten"-Knopf ergänzen, damit
FedEx-/DHL-Zollrechnungen sauber dreigeteilt werden:
1. EUSt → 0 %, Vorsteuer (KZ 62) — bestehendes Feature
2. **Zoll → 0 %, KEINE Vorsteuer, reine Betriebsausgabe — NEU**
3. Rest = FedEx-Gebühr @ 19 % → Vorsteuer (KZ 66)

## Befund

- EUSt-Split: `POST /belege/:id/split-eust`, Kind mit `import_eust=1, vat_rate=0,
  input_tax_deductible=1`, verknüpft über `receipts.eust_parent_receipt_id`,
  `created_via='eust_split'`, Kategorie „EUSt/Zoll" (id 14).
- `tax_categories` hat noch **keine** reine „Zoll"-Kategorie.
- Letzte DHL-Buchung (135/138): nur EUSt (19,66) abgespalten; Zoll blieb ggf. im
  19 %-Rest.

## Entscheidungen (mit Benny geklärt)

1. **Eigene Kategorie „Zoll"** (getrennt von „EUSt/Zoll").
2. Zoll-Kind: 0 % USt, **keine Vorsteuer** (`input_tax_deductible=0`), `steuerrelevant=1`
   (Betriebsausgabe fürs Einkommensteuer, aber nicht VAT-abziehbar).
3. **Eigene Verknüpfungs-Spalte** `zoll_parent_receipt_id` — die EUSt-/UStVA-Logik
   bleibt unangetastet; ein Beleg kann EUSt-Kind UND Zoll-Kind haben.

## Backend

**Migration (neue Nummer):**
- `ALTER TABLE receipts ADD COLUMN zoll_parent_receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL;`
- Seed Kategorie „Zoll": `INSERT ... SELECT` mit `NOT EXISTS`-Schutz — `default_vat_rate=0`,
  `default_input_tax_deductible=0`, `kind='expense'`, sinnvolle `sort_order`.
- Additiv, kein Rebuild, kein PRAGMA foreign_keys.

**Endpoint `POST /belege/:id/split-zoll`** (spiegelt split-eust):
- Body `{ zoll_cents }`; Validierung `>0 && < brutto`.
- Gesperrt bei `freigegeben_at` (409); Doppel-Split verhindern via
  `WHERE zoll_parent_receipt_id = ?` (409).
- In Transaktion: Parent um `zoll_cents` reduzieren; Kind anlegen mit
  `created_via='zoll_split', import_eust=0, vat_rate=0, amount_net=zoll_cents,
  vat_amount=0, input_tax_deductible=0, steuerrelevant=1, tax_category='Zoll',
  zoll_parent_receipt_id=parent`, Supplier/Datum/Status vom Parent.
- **Zusammenführen `POST /belege/:id/merge-zoll`** (oder DELETE des Kindes):
  Kind löschen, Parent-Betrag wieder erhöhen — symmetrisch zum EUSt-Merge.

**taxCalcService:** unverändert — Zoll-Kind hat `import_eust=0` und
`input_tax_deductible=0`, fällt also aus KZ 62 UND KZ 66 heraus (korrekt: keine
Vorsteuer). Kein Eingriff nötig.

## Frontend

- `belege.api.ts`: `splitZoll(id, zoll_cents)`, `mergeZoll(id)`; `Receipt`-Typ um
  `zoll_parent_receipt_id` erweitern.
- BelegeDetailPage / EUSt-Control-Komponente: parallelen „Zoll"-Block ergänzen
  (Eingabefeld + „Abspalten", bzw. Rück-Link/Zusammenführen), gleiche drei Fälle
  wie bei EUSt.

## Verifikation

1. Migration: Spalte + Kategorie „Zoll" existieren.
2. Test-Beleg (FedEx 29,32): EUSt 12,04 abspalten → Zoll 3,00 abspalten → Rest
   14,28 @ 19 %. UStVA: KZ 62 = 12,04, KZ 66 = 2,28, Zoll fällt heraus.
3. Zusammenführen stellt den Ursprungsbetrag wieder her.
4. EUSt-Split weiter unverändert funktionsfähig (beide Kinder nebeneinander möglich).

## Nicht im Scope

- Automatische Betrags-Erkennung aus dem OCR (Beträge werden manuell eingegeben,
  wie bei EUSt).
