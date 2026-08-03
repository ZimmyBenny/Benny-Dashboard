# „Aufgabe erstellen" im Vertrags-Modal

**Datum:** 2026-07-31 · **Status:** Von Benny freigegeben

## Ziel

Im Modal „Eintrag bearbeiten" (Verträge & Fristen) unten einen Knopf ergänzen, der
eine Aufgabe anlegt — vorbelegt mit Titel und Bereich des Vertrags.

## Befund (untersucht)

- `TaskSlideOver` unterstützt bereits `prefill?: { title?, area?, ... }` — kein neuer
  Dialog nötig.
- Bereichs-Vokabulare weichen ab: Verträge kennen `Amazon, DJ, Privat, Vermietung`,
  Aufgaben `DJ, Amazon, Finanzen, KI-Agenten, Privat, Sonstiges` (`AREAS` in
  TaskSlideOver.tsx). **`Vermietung` fehlt** bei den Aufgaben.
- **z-index-Konflikt:** ContractSlideOver nutzt 50/51, TaskSlideOver 40/50 — der
  Aufgaben-Dialog läge sonst hinter dem Vertrags-Modal.

## Entscheidungen (mit Benny geklärt)

1. **Titel-Vorbelegung:** `Vertrag: <Vertragstitel>` (Präfix, überschreibbar).
2. **`Vermietung`** wird in die Aufgaben-Bereichsliste aufgenommen (1:1-Vorbelegung).

## Umsetzung

**TaskSlideOver.tsx:** `AREAS` um `'Vermietung'` erweitern.

**ContractSlideOver.tsx:**
- Neuer Block unten (nach „Dokumente & Anhänge", vor den Footer-Knöpfen):
  Knopf „+ Aufgabe zu diesem Vertrag". Deaktiviert, wenn `form.title` leer ist
  (sonst entstünde der Titel „Vertrag: ").
- Klick öffnet `TaskSlideOver` mit
  `prefill={{ title: \`Vertrag: ${form.title.trim()}\`, area: form.area }}`.
- Speichern via `createTask` + `invalidateQueries({ queryKey: ['tasks'] })`
  (identisch zu DjOpenTasks/AmazonOpenTasks).
- **Überlagerung:** Der `TaskSlideOver` wird in ein `<div style={{ position:'relative',
  zIndex: 100 }}>` gehüllt → eigener Stacking-Context über dem Vertrags-Modal.
  `TaskSlideOver` selbst bleibt unverändert (keine Nebenwirkung auf andere Nutzer).
- `onDelete` ist im Neu-Anlegen-Fall nicht relevant (kein bestehender Task) —
  Dialog wird nur mit `task={null}` geöffnet.

## Verifikation

1. Vertrag öffnen → Knopf unten sichtbar; bei leerem Titel deaktiviert.
2. Klick → Aufgaben-Dialog erscheint **über** dem Vertrags-Modal, Titel
   `Vertrag: TSV Bandenwerbung`, Bereich `DJ`.
3. Speichern → Aufgabe erscheint in /tasks und im passenden Dashboard-Block.
4. Vertrag mit Bereich `Vermietung` → Bereich ist korrekt vorbelegt.

## Nicht im Scope

- Feste DB-Verknüpfung Aufgabe ↔ Vertrag
- Fälligkeit automatisch aus dem Ablaufdatum ableiten
