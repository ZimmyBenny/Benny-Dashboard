# Amazon Hersteller — Liste + Detailseite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hersteller-Sektion wird eine kompakte, klickbare Liste; ein Klick öffnet eine eigene Detailseite (eigene URL + Zurück-Button) mit Stammdaten + Angeboten. Angebotsvergleich bleibt in der Sektion. Reines Frontend.

**Architecture:** Neue Route `/amazon/entwicklung/products/:id/hersteller/:mId` → `ManufacturerDetailPage` (übernimmt die Stammdaten-Bearbeitung aus der bisherigen `ManufacturerCard` + `ManufacturerOffers` + Löschen). `ManufacturersSection` rendert statt voll ausgeklappter Karten eine kompakte Liste mit Drag-Sortierung, Kurs-Feld und Vergleich. `ManufacturerCard` wird entfernt.

**Tech Stack:** React 19, React Router v7, TanStack Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-08-amazon-hersteller-liste-detailseite-design.md`

---

## File Structure
- Create `frontend/src/pages/amazon/ManufacturerDetailPage.tsx`.
- Modify `frontend/src/routes/routes.tsx` (Import + Route).
- Rewrite `frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx` (kompakte Liste).
- Delete `frontend/src/components/amazon/manufacturers/ManufacturerCard.tsx`.

---

### Task 1: Detailseite + Route

**Files:**
- Create: `frontend/src/pages/amazon/ManufacturerDetailPage.tsx`
- Modify: `frontend/src/routes/routes.tsx`

- [ ] **Step 1: Detailseite anlegen** — `frontend/src/pages/amazon/ManufacturerDetailPage.tsx` mit genau diesem Inhalt:

```tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { type Manufacturer } from '../../api/amazon.api';
import { useManufacturers, useUpdateManufacturer, useDeleteManufacturer } from '../../hooks/amazon/useManufacturers';
import { ManufacturerOffers } from '../../components/amazon/manufacturers/ManufacturerOffers';

const ACCENT = '#34d399';

function DeleteDialog({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-[90%] max-w-sm" style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>Hersteller „{name || 'Hersteller'}" wird dauerhaft gelöscht.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: '#7f1d1d', color: '#fecaca' }}>Löschen</button>
        </div>
      </div>
    </div>
  );
}

function Stammdaten({ productId, manufacturer }: { productId: number; manufacturer: Manufacturer }) {
  const update = useUpdateManufacturer(productId);
  const [name, setName] = useState(manufacturer.name);
  const [ansprechpartner, setAnsprechpartner] = useState(manufacturer.ansprechpartner ?? '');
  const [adresse, setAdresse] = useState(manufacturer.adresse ?? '');
  const [email, setEmail] = useState(manufacturer.email ?? '');
  const [webseite, setWebseite] = useState(manufacturer.webseite ?? '');
  const [notizen, setNotizen] = useState(manufacturer.notizen ?? '');
  useEffect(() => { setName(manufacturer.name); }, [manufacturer.name]);
  useEffect(() => { setAnsprechpartner(manufacturer.ansprechpartner ?? ''); }, [manufacturer.ansprechpartner]);
  useEffect(() => { setAdresse(manufacturer.adresse ?? ''); }, [manufacturer.adresse]);
  useEffect(() => { setEmail(manufacturer.email ?? ''); }, [manufacturer.email]);
  useEffect(() => { setWebseite(manufacturer.webseite ?? ''); }, [manufacturer.webseite]);
  useEffect(() => { setNotizen(manufacturer.notizen ?? ''); }, [manufacturer.notizen]);
  const s = { background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)' };
  const mId = manufacturer.id;
  return (
    <div className="flex flex-col gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== manufacturer.name) update.mutate({ mId, patch: { name } }); }} placeholder="Herstellername" className="w-full px-2 py-1.5 rounded-md text-sm font-semibold" style={{ ...s, color: 'var(--color-on-surface)' }} />
      <input value={ansprechpartner} onChange={(e) => setAnsprechpartner(e.target.value)} onBlur={() => { if (ansprechpartner !== (manufacturer.ansprechpartner ?? '')) update.mutate({ mId, patch: { ansprechpartner } }); }} placeholder="Ansprechpartner" className="w-full px-2 py-1.5 rounded-md text-sm" style={s} />
      <textarea value={adresse} onChange={(e) => setAdresse(e.target.value)} onBlur={() => { if (adresse !== (manufacturer.adresse ?? '')) update.mutate({ mId, patch: { adresse } }); }} placeholder="Adresse" rows={2} className="w-full px-2 py-1.5 rounded-md text-sm" style={{ ...s, resize: 'vertical' }} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => { if (email !== (manufacturer.email ?? '')) update.mutate({ mId, patch: { email } }); }} placeholder="E-Mail" className="w-full px-2 py-1.5 rounded-md text-sm" style={s} />
      <input value={webseite} onChange={(e) => setWebseite(e.target.value)} onBlur={() => { if (webseite !== (manufacturer.webseite ?? '')) update.mutate({ mId, patch: { webseite } }); }} placeholder="Webseite" className="w-full px-2 py-1.5 rounded-md text-sm" style={s} />
      <div>
        <span className="text-xs uppercase tracking-wide block mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>Notizen</span>
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} onBlur={() => { if (notizen !== (manufacturer.notizen ?? '')) update.mutate({ mId, patch: { notizen } }); }} placeholder="Notizen zum Hersteller …" rows={3} className="w-full px-2 py-1.5 rounded-md text-sm" style={{ ...s, resize: 'vertical' }} />
      </div>
    </div>
  );
}

export function ManufacturerDetailPage() {
  const { id: idParam, mId: mIdParam } = useParams<{ id: string; mId: string }>();
  const navigate = useNavigate();
  const productId = Number(idParam);
  const mId = Number(mIdParam);
  const { data, isLoading } = useManufacturers(productId);
  const del = useDeleteManufacturer(productId);
  const [pendingDelete, setPendingDelete] = useState(false);
  const backTo = `/amazon/entwicklung/products/${productId}`;

  if (!Number.isInteger(productId) || !Number.isInteger(mId)) {
    return (<PageWrapper><p style={{ color: 'var(--color-on-surface-variant)' }}>Ungueltige Adresse.</p></PageWrapper>);
  }
  if (isLoading || !data) {
    return (<PageWrapper><p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Hersteller …</p></PageWrapper>);
  }
  const manufacturer = data.manufacturers.find(m => m.id === mId);
  if (!manufacturer) {
    return (
      <PageWrapper>
        <div className="flex flex-col gap-3">
          <p style={{ color: 'var(--color-on-surface)' }}>Hersteller nicht gefunden.</p>
          <Link to={backTo} className="px-3 py-1.5 rounded-md text-sm self-start" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Zurück zum Produkt</Link>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <header className="flex items-center gap-4 mb-6">
        <button type="button" onClick={() => navigate(backTo)} aria-label="Zurück" className="p-2 rounded-md" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-surface-container)' }}>
          <span className="material-symbols-outlined" style={{ color: ACCENT }}>factory</span>
        </div>
        <h1 className="flex-1 min-w-0 text-2xl font-bold truncate" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{manufacturer.name || 'Hersteller'}</h1>
        <button type="button" onClick={() => setPendingDelete(true)} className="p-2 rounded-md flex-shrink-0" style={{ color: '#fca5a5' }} aria-label="Hersteller löschen">
          <span className="material-symbols-outlined">delete</span>
        </button>
      </header>

      <div className="rounded-xl p-5 flex flex-col gap-5" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${ACCENT}` }}>
        <Stammdaten productId={productId} manufacturer={manufacturer} />
        <ManufacturerOffers productId={productId} mId={manufacturer.id} offers={manufacturer.offers} />
      </div>

      {pendingDelete && (
        <DeleteDialog name={manufacturer.name} onConfirm={() => { del.mutate(manufacturer.id); navigate(backTo); }} onClose={() => setPendingDelete(false)} />
      )}
    </PageWrapper>
  );
}
```

- [ ] **Step 2: Route registrieren** in `frontend/src/routes/routes.tsx`
  a) Import bei den anderen Amazon-Seiten ergänzen (nach dem `AmazonProductDetailPage`-Import):
  ```tsx
  import { ManufacturerDetailPage } from '../pages/amazon/ManufacturerDetailPage';
  ```
  b) Route nach `{ path: '/amazon/entwicklung/products/:id', element: <AmazonProductDetailPage /> },` ergänzen:
  ```tsx
          { path: '/amazon/entwicklung/products/:id/hersteller/:mId', element: <ManufacturerDetailPage /> },
  ```

- [ ] **Step 3: Typecheck + Build**
`cd frontend && npx tsc --noEmit` → PASS. `cd frontend && npx vite build` → PASS.
(Hinweis: `ManufacturerCard` wird in Task 2 entfernt; in Task 1 bleibt es vorerst bestehen, deshalb hier noch keine „unused"-Probleme.)

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/amazon/ManufacturerDetailPage.tsx frontend/src/routes/routes.tsx
git commit -m "feat(amazon-hersteller): eigene Detailseite je Hersteller + Route"
```

---

### Task 2: Sektion zur kompakten Liste umbauen

**Files:**
- Rewrite: `frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx`
- Delete: `frontend/src/components/amazon/manufacturers/ManufacturerCard.tsx`

- [ ] **Step 1: `ManufacturersSection.tsx` komplett ersetzen** durch:

```tsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Manufacturer } from '../../../api/amazon.api';
import {
  useManufacturers,
  useCreateManufacturer,
  useReorderManufacturers,
  useUpdateManufacturerSettings,
  parsePreis,
  eurPreis,
} from '../../../hooks/amazon/useManufacturers';
import { SectionHeader } from '../SectionHeader';
import { ManufacturerComparison } from './ManufacturerComparison';

const ACCENT = '#34d399';

interface Props { productId: number; }

export function ManufacturersSection({ productId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useManufacturers(productId);
  const create = useCreateManufacturer(productId);
  const reorder = useReorderManufacturers(productId);
  const updateSettings = useUpdateManufacturerSettings(productId);

  const [expanded, setExpanded] = useState(true);
  const [order, setOrder] = useState<number[] | null>(null);
  const [rateInput, setRateInput] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  if (isLoading) {
    return (
      <section className="rounded-xl p-5" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Hersteller …</p>
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className="rounded-xl p-5" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Hersteller konnten nicht geladen werden.</p>
        <button type="button" onClick={() => refetch()} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
      </section>
    );
  }

  const { manufacturers } = data;
  const rateValue = rateInput ?? (data.settings.usd_eur_rate ?? '');
  const rate = parsePreis(data.settings.usd_eur_rate);

  const ids = order ?? manufacturers.map(m => m.id);
  const byId = new Map(manufacturers.map(m => [m.id, m]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as Manufacturer[];

  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(manufacturers.map(m => m.id));
  }
  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => {
      const arr = [...(prev ?? manufacturers.map(m => m.id))];
      const [moved] = arr.splice(dragIndex.current as number, 1);
      arr.splice(idx, 0, moved);
      dragIndex.current = idx;
      return arr;
    });
  }
  function up() {
    if (dragIndex.current !== null && order) reorder.mutate(order, { onSettled: () => setOrder(null) });
    dragIndex.current = null;
  }

  function openManufacturer(mId: number) {
    navigate(`/amazon/entwicklung/products/${productId}/hersteller/${mId}`);
  }
  function cheapestEur(m: Manufacturer): string {
    const vals = m.offers.map(o => eurPreis(o, rate)).filter((n): n is number => n !== null);
    if (vals.length === 0) return '—';
    return Math.min(...vals).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader icon="factory" title="Hersteller" accent={ACCENT} expanded={expanded} onToggleExpand={() => setExpanded(e => !e)} />
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>1 USD =</span>
            <input
              value={rateValue}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={() => { if (rateInput !== null && rateInput !== (data.settings.usd_eur_rate ?? '')) updateSettings.mutate(rateInput); setRateInput(null); }}
              placeholder="z. B. 0,92"
              className="px-2 py-1 rounded-md text-xs w-24"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>€</span>
          </div>

          <div className="flex flex-col gap-2">
            {ordered.map((m, idx) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.10)', borderLeft: `3px solid ${ACCENT}` }}>
                <div
                  onPointerDown={(e) => down(idx, e)}
                  onPointerEnter={() => enter(idx)}
                  onPointerUp={up}
                  className="flex items-center justify-center rounded-md cursor-grab select-none flex-shrink-0 ml-2"
                  style={{ width: 26, height: 26, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
                  title="Zum Sortieren ziehen"
                >
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{idx + 1}</span>
                </div>
                <button type="button" onClick={() => openManufacturer(m.id)} className="flex-1 flex items-center gap-3 text-left px-2 py-3 min-w-0">
                  <span className="font-semibold truncate" style={{ color: 'var(--color-on-surface)' }}>{m.name || 'Hersteller'}</span>
                  {m.ansprechpartner ? <span className="text-xs truncate" style={{ color: 'var(--color-on-surface-variant)' }}>{m.ansprechpartner}</span> : null}
                  <span className="ml-auto flex items-center gap-3 flex-shrink-0">
                    {m.offers.some(o => o.is_latest) ? <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fbbf24', fontVariationSettings: "'FILL' 1" }}>star</span> : null}
                    <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{m.offers.length} Angebot{m.offers.length === 1 ? '' : 'e'}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--color-on-surface)' }}>{cheapestEur(m)}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>chevron_right</span>
                  </span>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => create.mutate(undefined, { onSuccess: (m) => openManufacturer(m.id) })}
            className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Hersteller hinzufügen
          </button>

          <ManufacturerComparison manufacturers={manufacturers} rate={rate} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `ManufacturerCard.tsx` entfernen**
```bash
git rm frontend/src/components/amazon/manufacturers/ManufacturerCard.tsx
```
(Sicherstellen, dass nichts mehr `ManufacturerCard` importiert: `grep -rn "ManufacturerCard" frontend/src` → darf nichts mehr finden.)

- [ ] **Step 3: Typecheck + Build**
`cd frontend && npx tsc --noEmit` → PASS (keine ungenutzten Imports, kein Verweis auf gelöschte Datei).
`cd frontend && npx vite build` → PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx
git commit -m "feat(amazon-hersteller): Sektion als kompakte Liste mit Navigation zur Detailseite"
```

---

## Manuelles UAT (nach beiden Tasks)
1. Produktseite → Hersteller-Sektion zeigt eine **kompakte Liste** (Name · Ansprechpartner · „N Angebote" · EUR-Preis · ⭐), nicht mehr alles ausgeklappt.
2. Klick auf eine Zeile → eigene Detailseite (URL `/amazon/entwicklung/products/:id/hersteller/:mId`); Stammdaten + Angebote bearbeitbar.
3. Zurück-Button und Browser-Zurück → zurück zur Produktseite.
4. „Hersteller hinzufügen" → springt direkt in die neue Detailseite.
5. Löschen auf der Detailseite (mit Bestätigung) → zurück zur Produktseite, Hersteller weg.
6. Drag-Sortierung über den Nummern-Griff in der Liste funktioniert; Klick darauf navigiert NICHT; Angebotsvergleich unverändert sichtbar.
```
