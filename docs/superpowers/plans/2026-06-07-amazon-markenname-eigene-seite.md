# Amazon — Markenname als eigenständige Seite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Markenname-Funktion von der Produkt-Detailseite auf eine eigene Seite mit Produkt-Dropdown verschieben, erreichbar über einen neuen Sidebar-Punkt unter Amazon — ohne jede Datenbank- oder Backend-Änderung.

**Architecture:** Reine Frontend-Reorganisation. Die bestehende `BrandNameSection` (produkt-gebunden) wird unverändert wiederverwendet und auf einer neuen Seite `AmazonBrandPage` mit `<select>`-Produktauswahl gerendert. Aus der Detailseite und der Sektions-Sortierung wird `'brand'` entfernt. Das Datenmodell (`product_id`-gebunden) und alle echten Daten bleiben unangetastet.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Tailwind v4, Electric Noir Design-Tokens.

---

## Datensicherheit

Keine Migration, kein DROP, kein Bulk-Update → **kein** `createBackup`-Aufruf nötig. Alle Markennamen-Daten bleiben über die neue Seite weiter erreichbar.

## File Structure

- **Create:** `frontend/src/pages/amazon/AmazonBrandPage.tsx` — neue Seite: Produkt-Dropdown + Einbindung `BrandNameSection`.
- **Modify:** `frontend/src/routes/routes.tsx` — Route `/amazon/entwicklung/markenname` + Import.
- **Modify:** `frontend/src/components/layout/navConfig.ts` — Sidebar-Subitem + `pageNames`-Eintrag.
- **Modify:** `frontend/src/hooks/amazon/useDetailSectionOrder.ts` — `'brand'` aus `DEFAULT_ORDER` entfernen.
- **Modify:** `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` — `BrandNameSection`-Import + Render-Zweig entfernen.

Unverändert (nur Nutzungsort wechselt): `BrandNameSection.tsx`, `BrandNameTable.tsx`, `BrandFavoritesPanel.tsx`, `BrandNotes.tsx`, `useBrand.ts`, `exportBrandPdf.ts`, alle Backend-Routen.

**Hinweis zum Testen:** Dieses Modul hat für die Frontend-Seiten keine bestehende Unit-Test-Infrastruktur; Verifikation erfolgt per Build/Typecheck + manuellem UAT (siehe Task 5). Backend ist nicht betroffen.

---

### Task 1: Neue Seite `AmazonBrandPage` anlegen

**Files:**
- Create: `frontend/src/pages/amazon/AmazonBrandPage.tsx`

- [ ] **Step 1: Seite schreiben**

Erzeuge `frontend/src/pages/amazon/AmazonBrandPage.tsx` mit exakt diesem Inhalt:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAmazonProducts } from '../../hooks/amazon/useAmazonProducts';
import { BrandNameSection } from '../../components/amazon/BrandNameSection';

const ACCENT = '#f472b6';
const STORAGE_KEY = 'amazon.brand.selected-product';

function readStoredId(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function AmazonBrandPage() {
  const { data: products = [], isLoading, isError, refetch } = useAmazonProducts(true);
  const [selectedId, setSelectedId] = useState<number | null>(readStoredId);

  // Auswahl gegen die geladene Liste abgleichen: gemerktes Produkt wählen,
  // sonst auf das erste Produkt zurückfallen.
  useEffect(() => {
    if (products.length === 0) return;
    const exists = selectedId != null && products.some(p => p.id === selectedId);
    if (!exists) setSelectedId(products[0].id);
  }, [products, selectedId]);

  // Auswahl persistieren.
  useEffect(() => {
    if (selectedId == null) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(selectedId));
    } catch {
      /* ignore */
    }
  }, [selectedId]);

  const selected = products.find(p => p.id === selectedId) ?? null;

  return (
    <PageWrapper>
      <header className="flex items-center gap-3 mb-6">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined" style={{ color: ACCENT }}>
            label
          </span>
        </div>
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            Markenname
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            Markennamen je Produkt recherchieren
          </p>
        </div>
      </header>

      {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Produkte …</p>}

      {isError && (
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container-low)' }}>
          <p style={{ color: 'var(--color-on-surface)' }}>Produkte konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            Erneut laden
          </button>
        </div>
      )}

      {!isLoading && !isError && products.length === 0 && (
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container-low)' }}>
          <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>
            Noch keine Produkte vorhanden.
          </p>
          <Link
            to="/amazon/entwicklung"
            className="px-3 py-1.5 rounded-md text-sm inline-block"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Zur Entwicklung
          </Link>
        </div>
      )}

      {!isLoading && !isError && products.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5 max-w-md">
            <label
              htmlFor="brand-product-select"
              className="text-sm"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Produkt
            </label>
            <select
              id="brand-product-select"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="px-3 py-2 rounded-md text-sm"
              style={{
                background: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <BrandNameSection productId={selected.id} productName={selected.name} />
          )}
        </div>
      )}
    </PageWrapper>
  );
}
```

- [ ] **Step 2: Typecheck/Build prüfen**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — keine Fehler in `AmazonBrandPage.tsx` (die Route-Verdrahtung folgt in Task 2; die Datei selbst typecheckt eigenständig, da alle Imports existieren).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/amazon/AmazonBrandPage.tsx
git commit -m "feat(amazon-brand): eigenstaendige Markenname-Seite mit Produkt-Dropdown"
```

---

### Task 2: Route registrieren

**Files:**
- Modify: `frontend/src/routes/routes.tsx`

- [ ] **Step 1: Import ergänzen**

In `frontend/src/routes/routes.tsx` direkt nach der Zeile
`import { AmazonChecklistMasterPage } from '../pages/amazon/AmazonChecklistMasterPage';`
folgende Zeile einfügen:

```tsx
import { AmazonBrandPage } from '../pages/amazon/AmazonBrandPage';
```

- [ ] **Step 2: Route-Eintrag ergänzen**

In `frontend/src/routes/routes.tsx` direkt nach der Zeile
`{ path: '/amazon/entwicklung/checkliste', element: <AmazonChecklistMasterPage /> },`
folgende Zeile einfügen:

```tsx
          { path: '/amazon/entwicklung/markenname', element: <AmazonBrandPage /> },
```

- [ ] **Step 3: Typecheck prüfen**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/routes.tsx
git commit -m "feat(amazon-brand): Route /amazon/entwicklung/markenname"
```

---

### Task 3: Sidebar-Punkt + Header-Titel

**Files:**
- Modify: `frontend/src/components/layout/navConfig.ts`

- [ ] **Step 1: Sidebar-Subitem ergänzen**

In `frontend/src/components/layout/navConfig.ts` das Amazon-Item so erweitern, dass nach der Checkliste-Zeile der Markenname-Eintrag steht. Ersetze den Block

```ts
  { path: '/amazon', label: 'Amazon', icon: 'shopping_cart', subItems: [
    { path: '/amazon/entwicklung',             label: 'Entwicklung',  icon: 'settings' },
    { path: '/amazon/entwicklung/checkliste',  label: 'Checkliste',   icon: 'checklist' },
  ]},
```

durch

```ts
  { path: '/amazon', label: 'Amazon', icon: 'shopping_cart', subItems: [
    { path: '/amazon/entwicklung',             label: 'Entwicklung',  icon: 'settings' },
    { path: '/amazon/entwicklung/checkliste',  label: 'Checkliste',   icon: 'checklist' },
    { path: '/amazon/entwicklung/markenname',  label: 'Markenname',   icon: 'label' },
  ]},
```

- [ ] **Step 2: `pageNames`-Eintrag ergänzen**

In derselben Datei in `pageNames` direkt nach der Zeile
`'/amazon/entwicklung/checkliste':   'Checkliste',`
einfügen:

```ts
  '/amazon/entwicklung/markenname':   'Markenname',
```

- [ ] **Step 3: Typecheck prüfen**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/navConfig.ts
git commit -m "feat(amazon-brand): Sidebar-Punkt Markenname unter Amazon"
```

---

### Task 4: Markenname-Sektion aus der Produkt-Detailseite entfernen

**Files:**
- Modify: `frontend/src/hooks/amazon/useDetailSectionOrder.ts`
- Modify: `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

- [ ] **Step 1: `'brand'` aus der Default-Sektions-Reihenfolge entfernen**

In `frontend/src/hooks/amazon/useDetailSectionOrder.ts` ersetze

```ts
const DEFAULT_ORDER = ['sourcing', 'brand', 'checklist'] as const;
```

durch

```ts
const DEFAULT_ORDER = ['sourcing', 'checklist'] as const;
```

(`DetailSectionId` leitet sich aus `DEFAULT_ORDER` ab → `'brand'` fällt automatisch raus. `readOrder` filtert ein evtl. in `localStorage` gespeichertes altes `'brand'` bereits heraus, da es nicht mehr in `DEFAULT_ORDER` enthalten ist.)

- [ ] **Step 2: Import von `BrandNameSection` aus der Detailseite entfernen**

In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` die Zeile

```tsx
import { BrandNameSection } from '../../components/amazon/BrandNameSection';
```

ersatzlos löschen.

- [ ] **Step 3: Render-Zweig für `'brand'` entfernen**

In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` im `DraggableSectionList`-Block die `render`-Funktion so anpassen — ersetze

```tsx
            render: () => {
              if (id === 'sourcing') return <SourcingSection productId={product.id} />;
              if (id === 'brand') return <BrandNameSection productId={product.id} productName={product.name} />;
              return <ChecklistSection productId={product.id} />;
            },
```

durch

```tsx
            render: () => {
              if (id === 'sourcing') return <SourcingSection productId={product.id} />;
              return <ChecklistSection productId={product.id} />;
            },
```

- [ ] **Step 4: Typecheck prüfen**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — keine ungenutzten Imports, kein verwaister `'brand'`-Branch.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/amazon/useDetailSectionOrder.ts frontend/src/pages/amazon/AmazonProductDetailPage.tsx
git commit -m "feat(amazon-brand): Markenname-Sektion aus Produkt-Detailseite entfernt"
```

---

### Task 5: Manuelle Verifikation (UAT)

**Files:** keine — reine Verifikation.

- [ ] **Step 1: Dev-Server prüfen/starten**

Falls nicht aktiv: Frontend (Vite) und Backend (Port 3001) laufen lassen. Bei stale Backend: `lsof -i :3001`, ggf. `pkill -f "tsx watch"` und neu starten.

- [ ] **Step 2: Sidebar + Navigation**

Erwartung: Unter „Amazon" erscheint „Markenname" (neben „Checkliste"). Klick öffnet `/amazon/entwicklung/markenname`, Header zeigt „Markenname".

- [ ] **Step 3: Echte Daten kontrollieren (kritisch)**

Im Dropdown „Rausfallschutz Boxspringbett" wählen. Erwartung: **exakt die bisherigen, echten Markennamen** dieses Produkts erscheinen (Tabelle, Favoriten-Karten, Sterne-Ranking, Notizen) — vollständig und unverändert. Stichprobe gegen den Stand vor der Änderung.

- [ ] **Step 4: Bearbeiten + PDF**

Einen Namen/Stern/Favorit ändern → Autosave wie bisher. „PDF exportieren" → Download startet und enthält die Namen.

- [ ] **Step 5: Persistenz**

Auf eine andere Seite wechseln und zurück zu „Markenname" → zuletzt gewähltes Produkt ist vorausgewählt.

- [ ] **Step 6: Detailseite ohne Markenname**

`/amazon/entwicklung/products/:id` öffnen. Erwartung: nur noch **Sourcing** und **Checkliste**, keine Markenname-Sektion. Neues Produkt anlegen → ebenfalls keine Markenname-Sektion.

- [ ] **Step 7: Abschluss**

Wenn alle Schritte grün: fertig. Bei Abweichung → systematic-debugging.

---

## Self-Review

**Spec coverage:**
- Neue Seite mit Dropdown → Task 1 ✅
- Route → Task 2 ✅
- Sidebar-Punkt + pageNames → Task 3 ✅
- Entfernen aus Detailseite + `useDetailSectionOrder` → Task 4 ✅
- Keine Backend-/DB-Änderung, Datenerhalt → durch Design garantiert; UAT Step 3 verifiziert ✅
- localStorage-Persistenz der Auswahl + Fallback auf erstes Produkt → Task 1 (`readStoredId` + Abgleich-Effect) ✅
- Leerzustand „keine Produkte" → Task 1 ✅

**Placeholder scan:** keine TBD/TODO; alle Code-Schritte vollständig.

**Type consistency:** `useAmazonProducts(true)` liefert `AmazonProduct[]` (`{ id: number; name: string; … }`); `BrandNameSection`-Props `{ productId: number; productName: string }` werden korrekt mit `selected.id`/`selected.name` befüllt; `STORAGE_KEY`/`readStoredId` konsistent verwendet.
