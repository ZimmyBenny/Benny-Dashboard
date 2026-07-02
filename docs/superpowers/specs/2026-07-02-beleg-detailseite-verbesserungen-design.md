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
- Wiederverwendung/Anlehnung an die bestehende `PdfPreviewModal`-Komponente (DJ-Angebote/Rechnungen); falls sie Bilder nicht abdeckt, um Bild-Fall erweitern statt Neubau.

**Umfang:** Frontend; ggf. kleine Erweiterung der vorhandenen Modal-Komponente.

---

## Feature 3 — Beleg ↔ Vertrag verknüpfen

Die dickste der drei. Nutzt das **vorhandene** Modul `contracts_and_deadlines` (Migr. 018/019/021/022/033) inkl. Feldern `provider_name`, `cost_amount`, `cost_interval` (einmalig/monatlich/quartalsweise/jährlich), `start_date`, `reminder_date`, `cancellation_notice_weeks`, `area` und dem Reminder-Job `contractReminders` (erinnert über `reminder_date`).

### Datenmodell

- Neue Migration: Spalte **`contract_id INTEGER REFERENCES contracts_and_deadlines(id) ON DELETE SET NULL`** auf `receipts` (nullable).
- Beziehung: 1 Vertrag → viele Belege; 1 Beleg → höchstens 1 Vertrag.
- **GoBD:** `contract_id` ist **nicht** vom GoBD-Lock erfasst (analog `notes`/`tags`/`payment_date`) — bleibt nach Freigabe änderbar. Der Trigger in Migration 040 wird entsprechend NICHT auf `contract_id` erweitert.
- Kein Link-/Zwischentabellen-Konstrukt (n:1 genügt).

### Backend

- `GET /api/belege/:id` liefert zusätzlich `contract_id` und eine schlanke `contract`-Kurzinfo (id, title, cost_interval, reminder_date) für die Anzeige.
- `PATCH /api/belege/:id` akzeptiert `contract_id` (setzen/entfernen) — als GoBD-freies Feld.
- **Neu anlegen aus Beleg:** wiederverwenden des bestehenden `POST` der Vertrags-Routes (`contracts.routes.ts`). Der Beleg liefert die Vorbelegung; nach dem Anlegen wird die zurückgegebene `contract_id` am Beleg gesetzt. Kein Doppel-Endpoint.
- **Rückrichtung:** `GET /api/contracts/:id` (oder ein `.../receipts`-Sub-Endpoint) liefert die zugehörigen Belege (Datum, Betrag, id) für die „Zugehörige Belege"-Liste.

### Frontend — im Beleg (Abschnitt „Zuordnung")

Neues Feld **„Vertrag"**:
- **Nicht verknüpft:** zwei Aktionen — „🔎 Bestehenden Vertrag wählen" (Such-Picker über Verträge) und „➕ Neuen Vertrag anlegen".
- **Verknüpft:** Chip „📄 {Titel} · {Intervall}" mit Klick → Sprung zum Vertrag; „✕ entfernen" löst die Verknüpfung (setzt `contract_id = null`).

**Neu anlegen — Vorbelegung aus dem Beleg:**
| Vertragsfeld | Quelle aus Beleg |
|---|---|
| `title` / `provider_name` | Lieferant (z. B. „netcup GmbH") |
| `cost_amount` | Bruttobetrag |
| `currency` | Beleg-Währung |
| `area` | Beleg-Bereich (primär) |
| `start_date` | Rechnungsdatum |
| `cost_interval` | **leer → Nutzer wählt** (nichts wird geraten) |

**Erinnerungsdatum (Vorschlag + editierbar):**
- Beim Anlegen/Verknüpfen schlägt das System `reminder_date` vor = **nächste Fälligkeit** (`start_date` + gewähltes Intervall) **minus** `cancellation_notice_weeks`.
- Der Vorschlag ist ein Default im Formular und **jederzeit überschreibbar**. Ohne gewähltes Intervall (einmalig) → kein Vorschlag.
- Danach erinnert der bestehende `contractReminders`-Job automatisch. Ändert der Nutzer später das Intervall/Datum am Vertrag, folgt die Erinnerung dem Vertrag (keine Sonderlogik am Beleg).

### Frontend — im Vertrag (Rückrichtung)

- Neuer Abschnitt **„Zugehörige Belege"** auf der Vertrags-Detail-/SlideOver-Ansicht: Liste der verknüpften Belege (Datum, Betrag) mit Sprung zum jeweiligen Beleg.

---

## Nicht-Ziele (YAGNI)

- Keine Auto-Erkennung des Intervalls aus dem Beleg — der Nutzer bestimmt es bewusst.
- Kein automatisches Fortschreiben des `reminder_date` bei jeder neuen Rechnung — der Vorschlag greift bei Anlage/Verknüpfung; Feineinstellung passiert am Vertrag.
- Keine n:m-Verknüpfung (ein Beleg → ein Vertrag genügt).
- Keine Änderung an der GoBD-Lock-Logik außer der bewussten Nicht-Aufnahme von `contract_id`.

## Betroffene Bereiche (Überblick)

- **DB:** 1 Migration (neue Spalte `receipts.contract_id`).
- **Backend:** `belege.routes.ts` (GET/PATCH um `contract_id`), `contracts.routes.ts` (Belege-Rückabfrage), ggf. Response-Typen.
- **Frontend:** `BelegeDetailPage.tsx` (Verlauf-Akkordeon, Lightbox-Trigger, Zuordnung→Vertrag), `PdfPreview`/`PdfPreviewModal` (Lightbox), Vertrags-Ansicht (`ContractsPage`/`ContractSlideOver` — „Zugehörige Belege"), neuer Vertrags-Picker.
- **Datensicherheit:** reine Additiv-Migration (ADD COLUMN), kein Bulk-Update → kein `createBackup` nötig; die Migrations-Pipeline sichert ohnehin automatisch.

## Offene Detailfragen für die Planung

- Genaue Wiederverwendung: existiert bereits ein Vertrags-Such-Picker (analog `ContactSearchPicker`/`ServiceSearchPicker`), der sich adaptieren lässt?
- Deckt `PdfPreviewModal` Bilder ab oder nur PDF? (bestimmt, ob erweitern oder generische Lightbox).
