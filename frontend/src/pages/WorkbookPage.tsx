import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDraggableModal } from '../hooks/useDraggableModal';
import {
  fetchSections,
  fetchPages,
  fetchPage,
  createPage,
  trackPageView,
  exportWorkbook,
  type Section,
  type Page,
} from '../api/workbook.api';
import { SectionList } from '../components/workbook/SectionList';
import { PageList } from '../components/workbook/PageList';
import { WorkbookEditor } from '../components/workbook/WorkbookEditor';
import { WorkbookHome } from '../components/workbook/WorkbookHome';
import { WorkbookSearch } from '../components/workbook/WorkbookSearch';
import { SectionSlideOver } from '../components/workbook/SectionSlideOver';
import { TemplatePickerModal } from '../components/workbook/TemplatePickerModal';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function WorkbookPage() {
  const location = useLocation();
  const [sections, setSections] = useState<Section[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [activePageId, setActivePageId] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sectionSlideOpen, setSectionSlideOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [exportSectionId, setExportSectionId] = useState<number | null>(null);
  const [exportPageId, setExportPageId] = useState<number | null>(null);
  const [exportPages, setExportPages] = useState<Page[]>([]);
  const [exporting, setExporting] = useState(false);
  const exportDrag = useDraggableModal();
  // Track whether a drag occurred to prevent backdrop-click closing on drag end
  const exportDragOccurred = useRef(false);

  // Load sections on mount
  useEffect(() => {
    fetchSections().then((s) => {
      setSections(s);
      if (s.length > 0 && activeSectionId === null) {
        setActiveSectionId(s[0].id);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load pages when active section changes
  useEffect(() => {
    if (activeSectionId === null) { setPages([]); return; }
    fetchPages({ section_id: activeSectionId }).then(setPages).catch(() => {});
  }, [activeSectionId]);

  // Load active page when selection changes
  useEffect(() => {
    setSaveStatus('idle');
    if (activePageId === null) { setActivePage(null); return; }
    fetchPage(activePageId).then((p) => {
      setActivePage(p);
    }).catch(() => {});
    trackPageView(activePageId).catch(() => {});
  }, [activePageId]);

  // openPageId aus location.state (Navigation von TaskSlideOver)
  useEffect(() => {
    const openPageId = (location.state as { openPageId?: number } | null)?.openPageId;
    if (openPageId) {
      setActivePageId(openPageId);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location.state]);

  // Lade Seiten fuer Export-Dialog wenn Sektion gewaehlt
  useEffect(() => {
    if (!exportDialogOpen || exportSectionId === null) { setExportPages([]); return; }
    fetchPages({ section_id: exportSectionId }).then(setExportPages).catch(() => setExportPages([]));
    setExportPageId(null);
  }, [exportDialogOpen, exportSectionId]);

  // Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Page header */}
      <div style={{
        padding: '0.875rem 1.5rem',
        borderBottom: '1px solid var(--color-outline-variant)',
        background: 'var(--color-surface-container-low)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span className="gradient-text" style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 800,
          fontSize: '1.5rem',
          letterSpacing: '-0.01em',
        }}>
          Arbeitsmappe
        </span>
        <button
          onClick={() => setExportDialogOpen(true)}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.9rem',
            background: 'var(--color-surface-container)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          title="Arbeitsmappe exportieren"
        >
          <span aria-hidden>&#x2B07;</span>
          Exportieren
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 280px 1fr',
          flex: 1,
          overflow: 'hidden',
          background: 'var(--color-surface)',
        }}
      >
        <SectionList
          sections={sections}
          activeId={activeSectionId}
          onSelect={(id) => {
            setActiveSectionId(id);
            setActivePageId(null);
          }}
          onNew={() => setSectionSlideOpen(true)}
          onReload={() => fetchSections().then((s) => {
            setSections(s);
            // Falls die aktive Sektion gelöscht wurde: erste verfügbare wählen oder leeren
            if (activeSectionId !== null && !s.find((sec) => sec.id === activeSectionId)) {
              const next = s[0]?.id ?? null;
              setActiveSectionId(next);
              setActivePageId(null);
              setActivePage(null);
            }
          }).catch(() => {})}
        />

        <PageList
          pages={pages}
          activeId={activePageId}
          onSelect={setActivePageId}
          onNew={() => setTemplateModalOpen(true)}
          onNewChild={async (parentId: number) => {
            const p = await createPage({
              section_id: activeSectionId ?? undefined,
              parent_id: parentId,
              title: 'Unbenannte Unterseite',
            });
            setActivePageId(p.id);
          }}
          onReload={() => {
            if (activeSectionId !== null) {
              fetchPages({ section_id: activeSectionId }).then(setPages).catch(() => {});
            }
          }}
        />

        {activePage ? (
          <WorkbookEditor
            page={activePage}
            onSaveStatusChange={setSaveStatus}
            saveStatus={saveStatus}
            onPageUpdated={(p: Page) => {
              setActivePage(p);
              setPages((ps) => ps.map((x) => (x.id === p.id ? p : x)));
            }}
            sectionName={sections.find((s) => s.id === activeSectionId)?.name ?? ''}
          />
        ) : (
          <WorkbookHome
            onOpenPage={(id) => setActivePageId(id)}
          />
        )}
      </div>
      </div>

      {/* Modals */}
      {searchOpen && (
        <WorkbookSearch
          onClose={() => setSearchOpen(false)}
          onNavigate={(pageId: number) => {
            setActivePageId(pageId);
            setSearchOpen(false);
          }}
        />
      )}

      {sectionSlideOpen && (
        <SectionSlideOver
          onClose={() => setSectionSlideOpen(false)}
          onSaved={() => {
            fetchSections().then(setSections).catch(() => {});
          }}
        />
      )}

      {templateModalOpen && (
        <TemplatePickerModal
          onClose={() => setTemplateModalOpen(false)}
          onCreate={async (template_id, template_name) => {
            const p = await createPage({
              section_id: activeSectionId ?? undefined,
              template_id: template_id ?? undefined,
              title: template_name,
            });
            setPages((ps) => [p, ...ps]);
            setActivePageId(p.id);
            setTemplateModalOpen(false);
          }}
        />
      )}

      {exportDialogOpen && (
        <div
          onClick={() => {
            if (exportDragOccurred.current) { exportDragOccurred.current = false; return; }
            if (!exporting) setExportDialogOpen(false);
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            data-draggable-modal
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(460px, 90vw)',
              background: 'var(--color-surface-container)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '0.75rem',
              padding: '1.25rem 1.5rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column', gap: '1rem',
              ...exportDrag.modalStyle,
            }}
          >
            <h2
              onMouseDown={(e) => { exportDragOccurred.current = true; exportDrag.onMouseDown(e); }}
              style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, ...exportDrag.headerStyle }}
            >
              Arbeitsmappe exportieren
            </h2>

            {/* Format */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>Format</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['csv', 'pdf'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setExportFormat(f)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-outline-variant)',
                      background: exportFormat === f ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: exportFormat === f ? 'var(--color-on-primary)' : 'var(--color-on-surface)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Bereich */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>Bereich</label>
              <select
                value={exportSectionId ?? ''}
                onChange={(e) => setExportSectionId(e.target.value === '' ? null : Number(e.target.value))}
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--color-outline-variant)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-on-surface)',
                }}
              >
                <option value="">Alle Bereiche</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Seite — nur wenn Bereich aktiv */}
            {exportSectionId !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>Seite</label>
                <select
                  value={exportPageId ?? ''}
                  onChange={(e) => setExportPageId(e.target.value === '' ? null : Number(e.target.value))}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--color-outline-variant)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  <option value="">Alle Seiten</option>
                  {exportPages.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Aktionen */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button
                onClick={() => setExportDialogOpen(false)}
                disabled={exporting}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--color-outline-variant)',
                  background: 'transparent',
                  color: 'var(--color-on-surface)',
                  cursor: exporting ? 'not-allowed' : 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportWorkbook({
                      format: exportFormat,
                      section_id: exportSectionId,
                      page_id: exportPageId,
                    });
                    setExportDialogOpen(false);
                  } catch (err) {
                    console.error('Export failed', err);
                    alert('Export fehlgeschlagen.');
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                  fontWeight: 600,
                  cursor: exporting ? 'not-allowed' : 'pointer',
                }}
              >
                {exporting ? 'Exportiere...' : 'Exportieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
