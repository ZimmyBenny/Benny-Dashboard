import { useEffect, useState } from 'react';
import {
  fetchSections,
  fetchPages,
  fetchPage,
  createPage,
  trackPageView,
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
  const [sections, setSections] = useState<Section[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [activePageId, setActivePageId] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sectionSlideOpen, setSectionSlideOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

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
          onReload={() => fetchSections().then(setSections).catch(() => {})}
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
    </>
  );
}
