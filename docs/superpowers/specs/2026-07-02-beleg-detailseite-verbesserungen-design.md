# Beleg-Detailseite — drei Verbesserungen (Design)

**Datum:** 2026-07-02
**Betrifft:** `BelegeDetailPage.tsx`, `PdfPreview`, Belege-Backend, Verträge-&-Fristen-Modul
**Status:** Entwurf zur Freigabe

## Ziel

Drei Verbesserungen an der Beleg-Detailseite, in **einem** Durchlauf umgesetzt:

1. **Verlauf einklappbar** — den GoBD-Audit-Trail standardmäßig zuklappen (ruhigere Seite, Verlauf bleibt erhalten).
2. **Beleg-Lightbox** — Klick auf die Beleg-Vorschau öffnet eine zoombare Vollbild-Ansicht.
3. **Beleg ↔ Vertrag** — einen Beleg mit einem Vertrag aus dem bestehenden „Verträge & Fristen"-Modul verknüpfen (bestehend wählen ODER neu anlegen), damit wiederkehrende Rechnungen (z. B. netcup-Domain jährlich) in die Fristen/Erinnerungen einfließen.

---

## Feature 1 — Verlauf einklappbar

**Ist-Zustand:** In der rechten Spalte rendert `<Section title="Verlauf"><AuditTrail entries={r.audit_log} /></Section>` (`BelegeDetailPage.tsx:794`) den kompletten Audit-Trail immer aufgeklappt.

**Soll:**
- Verlauf in ein Akkordeon packen, **standardmäßig zugeklappt**.
- Header zeigt die Anzahl: „Verlauf (N Einträge)" mit Aufklapp-Pfeil.
- Klick klappt auf/zu (lokaler `useState`, kein Persistieren nötig).
- Inhalt (`AuditTrail`) bleibt unverändert — nur der Container wird kollabierbar.

**Warum kein Löschen:** Der Verlauf ist der GoBD-Nachweis über Änderungen (Status, Freigabe, Beträge). Er muss erhalten und erreichbar bleiben, nur nicht dauerhaft im Blick.

**Umfang:** rein Frontend, eine Datei.

---

## Feature 2 — Beleg-Lightbox (Vollbild-Vorschau)

**Ist-Zustand:** Linke Spalte zeigt `<PdfPreview url={fileUrl} mimeType={primaryFile.mime_type} />` (`BelegeDetailPage.tsx:310`) als Inline-Vorschau. Kein Klick-zum-Vergrößern.

**Soll:**
- Klick auf die Vorschau (PDF **oder** Bild) öffnet eine **Vollbild-Lightbox**.
- Lightbox: dunkler Backdrop, zentrierte Darstellung, Schließen per ✕-Button und `Esc`.
- **Backdrop-Klick schließt NICHT** (Projektregel `feedback_ux_patterns`) — nur ✕/Esc.
- Zoom: Bilder skalierbar; PDF wird groß (nahe Viewport-Höhe) dargestellt.
- **Neue Belege-eigene Lightbox-Komponente** auf Basis der Blob-Lade-Logik von `belege/PdfPreview` (lädt via apiClient mit Auth-Header — direkter `iframe`/`img`-Zugriff liefert 401). Das DJ-`PdfPreviewModal` wird NICHT wiederverwendet: es ist PDF-only, schließt per Backdrop-Klick (verletzt die Projektregel) und hat keine Auth-Blob-Logik; es zu ändern wäre ein DJ-Regressionsrisiko.

**Umfang:** Frontend; eine neue Komponente im Belege-Kontext.

---

## Feature 3 — Beleg ↔ Vertrag verknüpfen

Die dickste der drei. Nutzt das **vorhandene** Modul `contracts_and_deadlines` (Migr. 018/019/021/022/033) inkl. Feldern `provider_name`, `cost_amount`, `cost_interval` (einmalig/monatlich/quartalsweise/jährlich), `start_date`, `reminder_date`, `cancellation_notice_weeks`, `area` und dem Reminder-Job `contractReminders`.

**Wichtiger Ist-Befund (Review 2026-07-02):** Der Reminder-Job liest `reminder_date` heute NICHT. Er berechnet sein Erinnerungsdatum selbst (nächster Jahrestag − 56 Tage, hartkodiert, `contractReminders.ts:34-36`) und feuert nur bei `auto_renews=1 AND cost_interval='jaehrlich' AND start_date IS NOT NULL AND status='aktiv' AND is_archived=0`. Monatlich/quartalsweise/einmalig lösen nie eine Erinnerung aus. → Deshalb enthält dieses Feature eine **Job-Erweiterung** (siehe unten), damit das versprochene Verhalten real ist.

### Datenmodell

- Neue Migration: Spalte **`contract_id INTEGER REFERENCES contracts_and_deadlines(id) ON DELETE SET NULL`** auf `receipts` (nullable).
- Beziehung: 1 Vertrag → viele Belege; 1 Beleg → höchstens 1 Vertrag.
- **GoBD:** `contract_id` ist **nicht** vom GoBD-Lock erfasst (analog `notes`/`tags`/`payment_date`) — bleibt nach Freigabe änderbar. Der Trigger in Migration 040 wird entsprechend NICHT auf `contract_id` erweitert.
- Kein Link-/Zwischentabellen-Konstrukt (n:1 genügt).

### Backend

- `GET /api/belege/:id` liefert zusätzlich `contract_id` und eine schlanke `contract`-Kurzinfo (id, title, cost_interval, reminder_date) für die Anzeige.
- `PATCH /api/belege/:id` akzeptiert `contract_id` (setzen/entfernen) — als GoBD-freies Feld. **Konkret:** `contract_id` in die `UPDATABLE_FIELDS`-Whitelist von `receiptService.update` aufnehmen (sonst stiller No-op) + Existenz-Validierung der Vertrags-ID (400/404 statt roher FK-Fehler). Der Audit-Log-Eintrag am Beleg entsteht dadurch automatisch über den PATCH-Pfad.
- **Vertrags-Activity-Log:** Verknüpfen/Entfernen erzeugt zusätzlich einen Eintrag im `contracts_and_deadlines_activity_log` (bestehendes Muster in `contracts.routes.ts`).
- **Neu anlegen aus Beleg:** wiederverwenden des bestehenden `POST /` der Vertrags-Routes (`contracts.routes.ts:325-401`, verlangt nur `title`). Der Beleg liefert die Vorbelegung; nach dem Anlegen wird die zurückgegebene `contract_id` am Beleg gesetzt. Kein Doppel-Endpoint.
- **Korrekturbeleg erbt die Verknüpfung:** `POST /:id/korrektur` kopiert eine explizite Spaltenliste — `contract_id` wird dort ergänzt, damit Storno/Korrektur fachlich beim selben Vertrag bleiben (sonst stimmen Summen je Vertrag nicht).
- **Vertrag löschen absichern:** `DELETE /:id` ist heute Hard-Delete ohne Prüfung. Neu: Response/Vorab-Info mit Anzahl verknüpfter Belege; das Frontend zeigt einen Confirm-Dialog („N verknüpfte Belege — Verknüpfungen werden entfernt") gemäß Projektregel „Confirm vor Löschen". `ON DELETE SET NULL` verhindert Datenbruch.
- **Rückrichtung:** `GET /api/contracts/:id/receipts` liefert die zugehörigen Belege (id, Datum, Betrag, **Währung**) für die „Zugehörige Belege"-Liste. (Existiert heute nicht — Neubau.)

### Reminder-Job-Erweiterung (contractReminders.ts)

Kleiner Umbau (~20 Zeilen), damit Erinnerungen für alle Intervalle und mit Nutzer-Override funktionieren:

1. **`reminder_date` als Override:** Ist am Vertrag ein `reminder_date` gesetzt, gilt dieses Datum — der Job erinnert daran statt an sein berechnetes Datum.
2. **Alle Intervalle:** Ohne gesetztes `reminder_date` berechnet der Job die nächste Fälligkeit auch für `monatlich` und `quartalsweise` (Formel „nächstes zukünftiges Vorkommen" analog der bestehenden Anniversary-Logik) und erinnert `cancellation_notice_weeks` Wochen vorher (statt hartkodierter 56 Tage; Default der Spalte ist 4 Wochen). `einmalig` ohne `reminder_date` → keine Erinnerung.
3. Bestehendes Verhalten für jährliche Auto-Renew-Verträge bleibt kompatibel (nur die 56-Tage-Konstante weicht dem `cancellation_notice_weeks`-Feld).

### Frontend — im Beleg (Abschnitt „Zuordnung")

Neues Feld **„Vertrag"**:
- **Nicht verknüpft:** zwei Aktionen — „🔎 Bestehenden Vertrag wählen" (Such-Picker über Verträge) und „➕ Neuen Vertrag anlegen".
- **Verknüpft:** Chip „📄 {Titel} · {Intervall}" mit Klick → Sprung zum Vertrag; „✕ entfernen" löst die Verknüpfung (setzt `contract_id = null`).

**Neu anlegen — Vorbelegung aus dem Beleg:**
| Vertragsfeld | Quelle aus Beleg |
|---|---|
| `title` / `provider_name` | Lieferant (z. B. „netcup GmbH") |
| `cost_amount` | Bruttobetrag — **Cents ÷ 100** (Beleg speichert `amount_gross_cents` INTEGER, Vertrag `cost_amount` REAL in Euro; Faktor-100-Falle!) |
| `currency` | Beleg-Währung |
| `area` | Beleg-Bereich (primär) — **mit Mapping**, da der Vertrags-CHECK nur `Privat/DJ/Amazon/Cashback/Finanzen/Banken/Sonstiges` erlaubt, Beleg-Areas aber frei sind: exakter Treffer → übernehmen; „Amazon FBA" → `Amazon`; sonst → `Sonstiges` |
| `start_date` | Rechnungsdatum |
| `cost_interval` | **leer → Nutzer wählt** (nichts wird geraten) |

**Erinnerungsdatum (Vorschlag + editierbar):**
- Beim Anlegen/Verknüpfen schlägt das System `reminder_date` vor = **nächste zukünftige Fälligkeit** (nächstes Vorkommen von `start_date` + Intervall, nicht naiv `start_date + Intervall` — bei älteren Verträgen läge das in der Vergangenheit) **minus** `cancellation_notice_weeks`.
- Der Vorschlag ist ein Default im Formular und **jederzeit überschreibbar**. Ohne gewähltes Intervall (einmalig) → kein Vorschlag.
- Danach erinnert der (erweiterte, s. o.) `contractReminders`-Job: gesetztes `reminder_date` gewinnt, sonst Berechnung je Intervall. Ändert der Nutzer später Intervall/Datum am Vertrag, folgt die Erinnerung dem Vertrag (keine Sonderlogik am Beleg).

### Frontend — im Vertrag (Rückrichtung)

- Neuer Abschnitt **„Zugehörige Belege"** im `ContractSlideOver` (als Full-width-Sektion nach „Dokumente & Anhänge"): Liste der verknüpften Belege (Datum, Betrag **inkl. Beleg-Währung** — kann von der Vertragswährung abweichen) mit Sprung zum jeweiligen Beleg.
- **Vertrags-Picker ist ein Neubau** (es existiert kein wiederverwendbarer Search-Picker; `workbook/ContactPicker` dient als Muster).

---

## Nicht-Ziele (YAGNI)

- Keine Auto-Erkennung des Intervalls aus dem Beleg — der Nutzer bestimmt es bewusst.
- Kein automatisches Fortschreiben des `reminder_date` bei jeder neuen Rechnung — der Vorschlag greift bei Anlage/Verknüpfung; Feineinstellung passiert am Vertrag.
- Keine n:m-Verknüpfung (ein Beleg → ein Vertrag genügt).
- Keine Änderung an der GoBD-Lock-Logik außer der bewussten Nicht-Aufnahme von `contract_id`.
- Keine Änderung am DJ-`PdfPreviewModal` (Regressionsrisiko; Belege bekommen eine eigene Lightbox).

## Betroffene Bereiche (Überblick)

- **DB:** 1 Migration (neue Spalte `receipts.contract_id`, additiv).
- **Backend:** `belege.routes.ts` (GET um contract-Info, Korrektur-Kopierliste), `receiptService.ts` (`UPDATABLE_FIELDS` + Validierung), `contracts.routes.ts` (`GET /:id/receipts`, Delete-Confirm-Info, Activity-Log), `jobs/contractReminders.ts` (Override + Intervalle).
- **Frontend:** `BelegeDetailPage.tsx` (Verlauf-Akkordeon, Lightbox-Trigger, Zuordnung→Vertrag), neue Belege-Lightbox (Basis: Blob-Logik aus `belege/PdfPreview`), neuer Vertrags-Picker (Muster: `workbook/ContactPicker`), `ContractSlideOver` („Zugehörige Belege"), Vertrags-Lösch-Confirm.
- **Datensicherheit:** reine Additiv-Migration (ADD COLUMN), kein Bulk-Update → kein `createBackup` nötig; die Migrations-Pipeline sichert ohnehin automatisch.

## Review-Historie

- **2026-07-02, Fable-Review:** GoBD-Trigger-Analyse und n:1-Architektur bestätigt. Korrigiert: Reminder-Job las `reminder_date` nicht (→ Job-Erweiterung beschlossen), Area-CHECK-Mapping ergänzt, Cents→Euro-Konvertierung ergänzt, Lightbox von DJ-Modal-Wiederverwendung auf Belege-eigenen Neubau umgestellt, Korrekturbeleg-Vererbung + PATCH-Whitelist + Lösch-Confirm aufgenommen. Beide vormals offenen Detailfragen damit beantwortet.
