# GoBD-Regeln — Compliance-Checkliste

Dies ist eine **nicht verhandelbare** Checkliste. Jede dieser Regeln muss im Code umgesetzt und durch Tests abgesichert sein. Das Finanzamt akzeptiert keine "Vergessen"-Ausreden bei einer Betriebsprüfung.

**Kontext:** Benny ist umsatzsteuerpflichtig (19 %) und muss GoBD-konform dokumentieren. Claude Code ist kein Steuerberater — aber der Code darf keine Strukturen ermöglichen, die GoBD eindeutig verletzen.

---

## 1. Unveränderlichkeit finalisierter Belege

### Regel
Einmal finalisierte Rechnungen und Stornorechnungen dürfen **inhaltlich nicht mehr verändert** werden.

### Umsetzung — Drei Verteidigungsschichten

1. **API-Middleware (erste Schicht):**
   Jeder `PUT`/`PATCH`/`DELETE` auf `/api/dj/invoices/:id` oder `/api/dj/invoices/:id/items/*` prüft `finalized_at`. Wenn gesetzt → `409 Conflict` mit Fehlermeldung:
   > „GoBD: Finalisierte Rechnung darf nicht verändert werden. Erstelle eine Stornorechnung."

2. **DB-Trigger (zweite Schicht, bereits im Schema):**
   Die Trigger `trg_dj_invoices_no_update_after_finalize` und Geschwister blockieren jeden direkten SQL-Zugriff. Selbst wenn jemand mit `sqlite3` CLI auf die DB zugreift.

3. **PDF-Hash (dritte Schicht — Nachweis):**
   Beim Finalisieren:
   - PDF generieren
   - SHA256-Hash des PDFs berechnen
   - Hash in `dj_invoices.pdf_hash` speichern
   - PDF-Datei in `backups/invoices/RE-XXXX.pdf` ablegen (siehe Punkt 7)
   
   Bei späterer Prüfung kann der Hash gegen das gespeicherte PDF verifiziert werden. Manipulation wird sichtbar.

### Erlaubte Updates nach Finalisierung
Diese Felder dürfen weiterhin geändert werden, weil sie keine Buchungsinhalte sind:
- `status` (offen → teilbezahlt → bezahlt → überfällig → storniert)
- `paid_amount` (wird automatisch aus `payments` berechnet)
- `sent_at` (Versanddatum)
- `cancelled_at`, `cancelled_by_invoice_id` (nur wenn Stornierung)

Die Trigger im Schema lassen diese Felder explizit passieren.

---

## 2. Lückenlose Nummernkreise

### Regel
Rechnungsnummern müssen **lückenlos und aufsteigend** sein. Eine fehlende Nummer zwischen RE-1061 und RE-1063 ist ein Red Flag bei der Betriebsprüfung.

### Umsetzung

1. **Nummer wird erst bei Finalisierung vergeben, nicht beim Anlegen.**
   Entwürfe haben `number = NULL` und werden intern per `id` referenziert.

2. **Atomare Inkrementierung via Transaktion:**
   ```js
   async function nextInvoiceNumber(db) {
     return db.transaction(() => {
       const row = db.prepare(
         "SELECT prefix, current_value, padding FROM number_sequences WHERE key = 'invoice'"
       ).get();
       const next = row.current_value + 1;
       db.prepare(
         "UPDATE number_sequences SET current_value = ?, updated_at = datetime('now') WHERE key = 'invoice'"
       ).run(next);
       return `${row.prefix}-${String(next).padStart(row.padding, '0')}`;
     })();
   }
   ```

3. **Wenn ein Entwurf gelöscht wird, geht keine Nummer verloren**, weil die Nummer erst beim Finalisieren vergeben wird.

4. **Wenn eine finalisierte Rechnung storniert wird, bleibt sie sichtbar** mit Status `storniert` und behält ihre Nummer. Es entsteht zusätzlich eine Stornorechnung mit neuer Nummer.

### Test
Integration-Test, der 100 parallele Finalisierungen triggert und prüft, dass keine Nummer doppelt oder ausgelassen wurde.

---

## 3. Stornierung ≠ Löschung

### Regel
Eine finalisierte Rechnung kann **nie gelöscht** werden. Korrekturen erfolgen ausschließlich über eine **Stornorechnung** (neue Rechnung mit negativen Beträgen).

### Begrifflichkeit
- ✅ "Rechnungskorrektur" oder "Stornorechnung"
- ❌ **Nicht** "Gutschrift" — der Begriff ist umsatzsteuerlich anders belegt (§ 14 Abs. 2 UStG: Gutschrift = Abrechnung durch den Leistungsempfänger). Seit der Änderung 2013 muss auf Korrekturbelegen explizit "Rechnungskorrektur" oder "Stornorechnung" stehen.

### Ablauf

1. Benny klickt auf „Stornieren" bei Rechnung RE-1061
2. System erzeugt neue Rechnung RE-1062 mit:
   - Alle Positionen mit **negativem** Vorzeichen
   - Header: „Stornorechnung zu RE-1061 vom [Datum]"
   - `is_cancellation = 1`
   - `cancels_invoice_id = <id von RE-1061>`
3. Original-Rechnung RE-1061 bekommt:
   - `status = 'storniert'`
   - `cancelled_by_invoice_id = <id von RE-1062>`
   - `cancelled_at = NOW()`
4. Beide Rechnungen werden finalisiert und sind fortan unveränderlich.
5. Audit-Log-Eintrag mit Aktion `cancel` und Verweis auf beide IDs.

### UI
- Original-Rechnung zeigt prominent ein rotes Banner: „Diese Rechnung wurde am [Datum] durch RE-1062 storniert."
- Stornorechnung zeigt: „Dies ist eine Stornorechnung zu RE-1061."
- Die Original-Rechnung bleibt in der Liste sichtbar (nicht versteckt), mit Status-Pill „storniert".

---

## 4. Audit-Log

### Regel
Jede finanzrelevante Aktion wird in `dj_audit_log` festgehalten. Das Audit-Log ist **append-only** — nie updaten, nie löschen.

### Welche Aktionen loggen?

| Entity | Actions |
|---|---|
| `invoice` | `create`, `update`, `finalize`, `send`, `cancel`, `pay` |
| `quote` | `create`, `update`, `finalize`, `send`, `accept`, `reject`, `convert_to_invoice` |
| `customer` | `create`, `update`, `delete` |
| `payment` | `create`, `delete` |
| `expense` | `create`, `update`, `delete` |
| `service` / `package` | `create`, `update`, `deactivate` |
| `settings` | `update` (nur finanzrelevante Keys wie `tax`, `company`, `number_sequences`) |

### Was wird geloggt?
- `entity_type`, `entity_id`, `action`
- `user_id`, `user_name` (aus bestehendem JWT)
- `old_value` (JSON-Snapshot vor der Änderung, bei Update/Delete)
- `new_value` (JSON-Snapshot nach der Änderung, bei Create/Update)
- `ip_address`, `user_agent` (aus Request-Headers)
- `created_at`

### Implementation-Tipp
Express-Middleware, die Routen explizit markiert (z.B. via Route-Meta oder Wrapper-Function), damit nicht jede Route manuell loggen muss.

### Kein UPDATE/DELETE auf Audit-Log
- Datenbank-Trigger, der alle `UPDATE` und `DELETE` auf `dj_audit_log` mit `RAISE(ABORT)` blockiert (von Claude Code beim Seeden zu ergänzen, nicht im Schema, damit das Schema erstmal nur das Minimum enthält).
- Alternative: separate SQLite-Datei nur für Audit-Log, die in der Anwendung readonly gemounted wird außer für Appends.

---

## 5. USt-Ausweis auf Rechnungen

### Pflichtangaben (§ 14 Abs. 4 UStG)

Jede Rechnung muss enthalten:

1. ✅ Vollständiger Name und Anschrift des leistenden Unternehmers
2. ✅ Vollständiger Name und Anschrift des Leistungsempfängers
3. ✅ Steuernummer oder USt-IdNr. des leistenden Unternehmers
4. ✅ Ausstellungsdatum
5. ✅ Fortlaufende, einmalige Rechnungsnummer
6. ✅ Menge und Art der gelieferten Gegenstände / Umfang und Art der Leistung
7. ✅ Zeitpunkt der Lieferung/Leistung (= Lieferdatum/Eventdatum)
8. ✅ Nach Steuersätzen aufgeschlüsseltes Entgelt (Netto) + darauf entfallende Steuer
9. ✅ Im Voraus vereinbarte Minderung (Rabatte, Skonti)
10. ✅ Bei Steuerbefreiung: Hinweis auf die Steuerbefreiung

→ All das muss im PDF-Template abgebildet sein. Siehe `RECHNUNGS_TEMPLATE.md`.

---

## 6. Verpflegungsmehraufwand & Kilometerpauschale (Hinweis, nicht Compliance)

Diese sind **keine GoBD-Regel**, aber für Bennys Steuererklärung wichtig. Der Code sollte:

- **Kilometerpauschale:** 0,30 €/km für Dienstreisen (Hin + Rück zählen).
  - **Nicht zu verwechseln mit Entfernungspauschale** (38 ct ab 2026, nur für Wohnung ↔ erste Betriebsstätte).
  - DJ-Einsätze sind Dienstreisen zu wechselnden Einsatzorten → Kilometerpauschale.
- **Verpflegungsmehraufwand** (§ 9 Abs. 4a EStG):
  - 8–24 h Abwesenheit: **14 €**
  - Voller Kalendertag (>24 h, mehrtägige Festivals): **28 €**
  - Ab- und Anreisetag bei mehrtägigen Einsätzen: jeweils **14 €**

Diese Werte sind konfigurierbar in den Einstellungen, damit sie bei Gesetzesänderungen angepasst werden können.

### Disclaimer im UI
Auf Seiten Fahrten und Buchhaltung **immer** ein Banner anzeigen:
> „Diese Auflistung dient ausschließlich als Orientierungshilfe für die eigene Buchhaltung und ersetzt keine Steuerberatung. Vor Einreichung beim Finanzamt bitte mit dem Steuerberater abstimmen."

---

## 7. Datensicherung und Aufbewahrung

### Aufbewahrungspflicht
**10 Jahre** für Rechnungen, Buchungsbelege, Jahresabschlüsse (§ 147 Abs. 3 AO).

### Umsetzung

1. **Automatisches Backup** der SQLite-Datei:
   - Nightly Snapshot in `backups/db/pulse_YYYY-MM-DD.sqlite`
   - Rotation: 30 tägliche, 12 monatliche, 10 jährliche Backups behalten
   - Konfigurierbar in Einstellungen → Backup

2. **Separates PDF-Archiv:**
   - Jede finalisierte Rechnung als PDF unter `backups/invoices/RE-XXXX.pdf` ablegen
   - Diese Datei darf niemals überschrieben oder gelöscht werden
   - Beim Finalisieren wird der Pfad in `dj_invoices.pdf_path` gespeichert

3. **Hinweis an Benny (UI-Banner in Einstellungen → Backup):**
   > „Das System speichert lokal auf deinem Rechner. Für die 10-jährige Aufbewahrungspflicht musst du selbst zusätzliche Sicherheitskopien anlegen (externe Festplatte, NAS, verschlüsselter Cloud-Speicher). Empfehlung: Backup-Ordner monatlich auf ein zweites Medium kopieren."

---

## 8. Datumsangaben

- `invoice_date` (Rechnungsdatum): Datum der Rechnungserstellung
- `delivery_date` (Lieferdatum / Leistungsdatum): Datum der Veranstaltung
- `due_date` (Fälligkeit): `invoice_date + payment_term_days`

Alle drei sind **Pflichtangaben** auf der Rechnung.

---

## 9. Checkliste für Claude Code beim Bau

- [ ] API-Middleware `gobdGuard` ist aktiv auf allen schreibenden Endpunkten für Rechnungen und Rechnungspositionen
- [ ] Nummernkreis-Service ist transaktional und wird **nur** beim Finalisieren aufgerufen
- [ ] PDF-Hash wird berechnet und gespeichert beim Finalisieren
- [ ] PDF wird in `backups/invoices/` archiviert beim Finalisieren
- [ ] Audit-Log-Middleware loggt alle im Abschnitt 4 genannten Aktionen
- [ ] Stornorechnungs-Flow erzeugt neues Dokument statt zu ändern
- [ ] UI zeigt finalisierte Rechnungen im Readonly-Modus (keine editierbaren Felder)
- [ ] UI zeigt Disclaimer auf Fahrten und Buchhaltung
- [ ] Backup-Funktion ist implementiert und per Settings konfigurierbar
- [ ] Integration-Tests für: Nummernkreis-Atomarität, Finalize-Block, Storno-Flow, Audit-Log-Append
