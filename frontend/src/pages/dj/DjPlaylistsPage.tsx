import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import { PlaylistViewerOverlay } from '../../components/dj/PlaylistViewerOverlay';
import {
  fetchPlaylists,
  uploadPlaylist,
  updatePlaylist,
  deletePlaylist,
  fetchPlaylistCategories,
  createPlaylistCategory,
  updatePlaylistCategory,
  deletePlaylistCategory,
  fetchPlaylistDjs,
  createPlaylistDj,
  updatePlaylistDj,
  deletePlaylistDj,
  exportPlaylistsZip,
  Playlist,
  PlaylistCategory,
  PlaylistDj,
} from '../../api/dj.playlists.api';
import { formatDateTime } from '../../lib/format';

type SortKey = 'title' | 'category_name' | 'dj_name' | 'year' | 'created_at';
type SortDir = 'asc' | 'desc';

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,170,255,0.2)',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--color-on-surface)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

const gradientBtn: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
  color: 'var(--color-on-primary)',
  border: 'none',
  borderRadius: '999px',
  padding: '0.5rem 1.25rem',
  fontFamily: 'var(--font-body)',
  fontWeight: 700,
  fontSize: '0.875rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  boxShadow: '0 0 16px rgba(148,170,255,0.3)',
  letterSpacing: '0.03em',
};

const secondaryBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid rgba(148,170,255,0.25)',
  borderRadius: '999px',
  padding: '0.5rem 1.125rem',
  fontFamily: 'var(--font-body)',
  fontWeight: 600,
  fontSize: '0.875rem',
  color: 'var(--color-on-surface)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
};

function fileNameWithoutExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf', '.html', '.htm', '.docx', '.txt'];

function isAllowedPlaylistFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function DjPlaylistsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'title', dir: 'asc' });

  // Upload-Flow
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategoryId, setUploadCategoryId] = useState<number | null>(null);
  const [uploadNewCatName, setUploadNewCatName] = useState('');
  const [uploadDjId, setUploadDjId] = useState<number | null>(null);
  const [uploadYear, setUploadYear] = useState('');
  const [uploadNewDjName, setUploadNewDjName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bearbeiten
  const [editTarget, setEditTarget] = useState<Playlist | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [editDjId, setEditDjId] = useState<number | null>(null);
  const [editYear, setEditYear] = useState('');

  // Kategorien- & DJs-Dialog
  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renameCategoryId, setRenameCategoryId] = useState<number | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState('');
  const [newDjName, setNewDjName] = useState('');
  const [renameDjId, setRenameDjId] = useState<number | null>(null);
  const [renameDjName, setRenameDjName] = useState('');

  // Filter
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [filterDjId, setFilterDjId] = useState<number | null>(null);

  // Viewer
  const [viewerPlaylist, setViewerPlaylist] = useState<Playlist | null>(null);

  // Drag & Drop aus dem Finder
  const [isDropActive, setIsDropActive] = useState(false);
  const dragCounter = useRef(0);

  // ZIP-Export
  const [exporting, setExporting] = useState(false);

  function submitUpload() {
    if (!uploadTitle.trim() || uploadMutation.isPending) return;
    uploadMutation.mutate();
  }

  function submitEdit() {
    if (!editTitle.trim() || updateMutation.isPending) return;
    updateMutation.mutate({
      title: editTitle.trim(),
      category_id: editCategoryId,
      dj_id: editDjId,
      year: editYear.trim() === '' ? null : Number(editYear),
    });
  }

  async function handleExportZip() {
    setExporting(true);
    try {
      const { blob, filename } = await exportPlaylistsZip(filterCategoryId, filterDjId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('Export fehlgeschlagen — gibt es Playlisten für diesen Filter?');
    } finally {
      setExporting(false);
    }
  }

  const queryClient = useQueryClient();
  const { onMouseDown: uploadDragDown, modalStyle: uploadModalStyle, headerStyle: uploadHeaderStyle } = useDraggableModal();
  const { onMouseDown: catDragDown, modalStyle: catModalStyle, headerStyle: catHeaderStyle } = useDraggableModal();
  const { onMouseDown: editDragDown, modalStyle: editModalStyle, headerStyle: editHeaderStyle } = useDraggableModal();

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['dj-playlists'],
    queryFn: fetchPlaylists,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['dj-playlist-categories'],
    queryFn: fetchPlaylistCategories,
  });

  const { data: djs = [] } = useQuery({
    queryKey: ['dj-playlist-djs'],
    queryFn: fetchPlaylistDjs,
  });

  function startNextUpload(queue: File[]) {
    if (queue.length === 0) {
      setCurrentFile(null);
      setUploadQueue([]);
      return;
    }
    const [next, ...rest] = queue;
    setUploadQueue(rest);
    setCurrentFile(next);
    setUploadTitle(fileNameWithoutExt(next.name));
    setUploadCategoryId(null);
    setUploadNewCatName('');
    setUploadDjId(null);
    setUploadYear('');
    setUploadNewDjName('');
    setUploadError('');
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    enqueueFiles(Array.from(files));
  }

  function enqueueFiles(files: File[]) {
    const allowed = files.filter((f) => isAllowedPlaylistFile(f.name));
    const rejected = files.length - allowed.length;
    if (rejected > 0) {
      window.alert(
        `${rejected} Datei(en) übersprungen — erlaubt sind Excel (.xlsx/.xls), CSV, PDF, HTML, Word (.docx) und Text (.txt).`,
      );
    }
    if (allowed.length === 0) return;
    if (currentFile) {
      // Dialog ist gerade offen -> hinten an die Warteschlange anhängen
      setUploadQueue((q) => [...q, ...allowed]);
    } else {
      startNextUpload(allowed);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current++;
    setIsDropActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDropActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDropActive(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) enqueueFiles(files);
  }

  const uploadMutation = useMutation({
    mutationFn: () =>
      uploadPlaylist(
        currentFile as File,
        uploadTitle.trim(),
        uploadCategoryId,
        uploadDjId,
        uploadYear.trim() === '' ? null : Number(uploadYear),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlists'] });
      startNextUpload(uploadQueue);
    },
    onError: () => {
      setUploadError('Upload fehlgeschlagen. Bitte erneut versuchen.');
    },
  });

  const createCategoryInlineMutation = useMutation({
    mutationFn: (name: string) => createPlaylistCategory(name),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-categories'] });
      setUploadCategoryId(created.id);
      setUploadNewCatName('');
    },
  });

  const createDjInlineMutation = useMutation({
    mutationFn: (name: string) => createPlaylistDj(name),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-djs'] });
      setUploadDjId(created.id);
      setUploadNewDjName('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { title?: string; category_id?: number | null; dj_id?: number | null; year?: number | null }) =>
      updatePlaylist(editTarget!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlists'] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePlaylist(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-playlists'] }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => createPlaylistCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-categories'] });
      setNewCategoryName('');
    },
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updatePlaylistCategory(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-categories'] });
      queryClient.invalidateQueries({ queryKey: ['dj-playlists'] });
      setRenameCategoryId(null);
      setRenameCategoryName('');
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => deletePlaylistCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-categories'] });
      queryClient.invalidateQueries({ queryKey: ['dj-playlists'] });
    },
  });

  const createDjMutation = useMutation({
    mutationFn: (name: string) => createPlaylistDj(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-djs'] });
      setNewDjName('');
    },
  });

  const renameDjMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updatePlaylistDj(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-djs'] });
      queryClient.invalidateQueries({ queryKey: ['dj-playlists'] });
      setRenameDjId(null);
      setRenameDjName('');
    },
  });

  const deleteDjMutation = useMutation({
    mutationFn: (id: number) => deletePlaylistDj(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-playlist-djs'] });
      queryClient.invalidateQueries({ queryKey: ['dj-playlists'] });
    },
  });

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const filtered = playlists.filter((p) => {
    if (filterCategoryId !== null && p.category_id !== filterCategoryId) return false;
    if (filterDjId !== null && p.dj_id !== filterDjId) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.category_name ?? '').toLowerCase().includes(q) ||
      (p.dj_name ?? '').toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sort.key === 'title') cmp = a.title.localeCompare(b.title, 'de');
    else if (sort.key === 'category_name') cmp = (a.category_name ?? '').localeCompare(b.category_name ?? '', 'de');
    else if (sort.key === 'dj_name') cmp = (a.dj_name ?? '').localeCompare(b.dj_name ?? '', 'de');
    else if (sort.key === 'year') cmp = (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER);
    else if (sort.key === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  function sortIcon(key: SortKey) {
    if (sort.key !== key) return null;
    return (
      <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>
        {sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
      </span>
    );
  }

  function openEdit(p: Playlist) {
    setEditTarget(p);
    setEditTitle(p.title);
    setEditCategoryId(p.category_id);
    setEditDjId(p.dj_id);
    setEditYear(p.year !== null ? String(p.year) : '');
  }

  function handleDelete(p: Playlist) {
    const ok = window.confirm(
      `Diese Playlist wirklich löschen? Die Datei wird auch in Dokumente → DJ → Playlisten gelöscht.`,
    );
    if (ok) deleteMutation.mutate(p.id);
  }

  function handleDeleteCategory(c: PlaylistCategory) {
    const ok = window.confirm(
      `Kategorie löschen? Zugeordnete Playlists bleiben erhalten und werden „Ohne Kategorie".`,
    );
    if (ok) deleteCategoryMutation.mutate(c.id);
  }

  function handleDeleteDj(dj: PlaylistDj) {
    const ok = window.confirm(
      `DJ löschen? Zugeordnete Playlists bleiben erhalten und werden „Ohne DJ"; die Dateien ziehen zurück nach Playlisten/.`,
    );
    if (ok) deleteDjMutation.mutate(dj.id);
  }

  return (
    <PageWrapper>
      <div
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative', minHeight: '70vh' }}
      >

        {/* Drop-Overlay beim Ziehen aus dem Finder */}
        {isDropActive && (
          <div style={{
            position: 'absolute', inset: '0.75rem', zIndex: 5,
            border: '2px dashed var(--color-primary)',
            borderRadius: '1rem',
            background: 'rgba(148,170,255,0.08)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '0.75rem', pointerEvents: 'none',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-primary)' }}>
              cloud_upload
            </span>
            <p style={{
              fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem',
              color: 'var(--color-on-surface)', margin: 0,
            }}>
              Playlisten hier ablegen
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
              Excel, CSV, PDF, HTML, Word oder Text
            </p>
          </div>
        )}

        <div style={{
          position: 'absolute', top: '-60px', right: '10%',
          width: '480px', height: '480px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(148,170,255,0.07) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2.25rem',
                color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                Playlisten
              </h1>
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
                Excel-, CSV-, PDF-, HTML-, Word- und Text-Playlisten zentral verwalten und ansehen.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                onClick={handleExportZip}
                disabled={exporting}
                title="Exportiert die aktuell gefilterten Playlisten als ZIP"
                style={{ ...secondaryBtn, opacity: exporting ? 0.6 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>folder_zip</span>
                {exporting ? 'Exportiert…' : 'Als ZIP exportieren'}
              </button>
              <button onClick={() => setShowCategories(true)} style={secondaryBtn}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>label</span>
                Kategorien &amp; DJs
              </button>
              <button onClick={() => fileInputRef.current?.click()} style={gradientBtn}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span>
                Hochladen
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.pdf,.html,.htm,.docx,.txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {/* Suche + Filter */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ maxWidth: '360px', flex: '1 1 260px' }}>
              <input
                type="text"
                placeholder="Suche nach Name, Kategorie oder DJ…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ maxWidth: '220px', flex: '1 1 180px' }}>
              <select
                value={filterCategoryId ?? ''}
                onChange={(e) => setFilterCategoryId(e.target.value === '' ? null : Number(e.target.value))}
                style={inputStyle}
              >
                <option value="">Alle Kategorien</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ maxWidth: '220px', flex: '1 1 180px' }}>
              <select
                value={filterDjId ?? ''}
                onChange={(e) => setFilterDjId(e.target.value === '' ? null : Number(e.target.value))}
                style={inputStyle}
              >
                <option value="">Alle DJs</option>
                {djs.map((dj) => (
                  <option key={dj.id} value={dj.id}>{dj.name}</option>
                ))}
              </select>
            </div>
            {(search !== '' || filterCategoryId !== null || filterDjId !== null) && (
              <button
                onClick={() => { setSearch(''); setFilterCategoryId(null); setFilterDjId(null); }}
                title="Suche und alle Filter zurücksetzen"
                style={{ ...secondaryBtn, flex: '0 0 auto' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>filter_alt_off</span>
                Filter zurücksetzen
              </button>
            )}
          </div>

          {/* Tabelle */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', overflowX: 'auto', overflowY: 'hidden' }}>
            {isLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>hourglass_empty</span>
                Lade Playlisten…
              </div>
            ) : sorted.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-primary)', display: 'block', marginBottom: '1rem', opacity: 0.5 }}>queue_music</span>
                <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>
                  {playlists.length === 0 ? 'Noch keine Playlisten hochgeladen.' : 'Keine Playlisten gefunden.'}
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {([
                      ['title', 'Name'],
                      ['category_name', 'Kategorie'],
                      ['dj_name', 'DJ'],
                      ['year', 'Jahr'],
                      ['created_at', 'Hochgeladen'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        style={{
                          padding: '0.75rem 0.5rem', textAlign: 'left', cursor: 'pointer',
                          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.7rem',
                          color: 'var(--color-on-surface-variant)', letterSpacing: '0.08em',
                          textTransform: 'uppercase', whiteSpace: 'nowrap', userSelect: 'none',
                        }}
                      >
                        {label} {sortIcon(key)}
                      </th>
                    ))}
                    <th style={{ padding: '0.75rem 0.5rem' }} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, i) => (
                    <tr
                      key={p.id}
                      style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(148,170,255,0.04)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setViewerPlaylist(p)}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>
                        {p.title}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {p.category_name ? (
                          <span style={{
                            background: 'rgba(148,170,255,0.15)', color: '#94aaff',
                            borderRadius: '0.375rem', padding: '0.125rem 0.5rem',
                            fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap',
                          }}>{p.category_name}</span>
                        ) : <span style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6, fontStyle: 'italic' }}>Ohne Kategorie</span>}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {p.dj_name ? (
                          <span style={{
                            background: 'rgba(94,234,212,0.15)', color: 'var(--color-secondary)',
                            borderRadius: '0.375rem', padding: '0.125rem 0.5rem',
                            fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap',
                          }}>{p.dj_name}</span>
                        ) : <span style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6, fontStyle: 'italic' }}>Ohne DJ</span>}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                        {p.year ?? '—'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(p.created_at)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <button
                            onClick={() => openEdit(p)}
                            title="Bearbeiten"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--color-primary)', padding: '0.25rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center',
                              opacity: 0.6, transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.6')}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            title="Löschen"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--color-error)', padding: '0.25rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center',
                              opacity: 0.6, transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.6')}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {/* Upload-Dialog (je Datei) */}
      {currentFile && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
          <div
            data-draggable-modal
            style={{
              position: 'fixed', top: 80, right: 32, width: '420px',
              background: 'var(--color-surface-container-high)',
              border: '1px solid rgba(148,170,255,0.25)',
              borderRadius: '0.75rem',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(148,170,255,0.05)',
              zIndex: 50, ...uploadModalStyle,
            }}
          >
            <div
              onMouseDown={uploadDragDown}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148,170,255,0.12)',
                ...uploadHeaderStyle,
              }}
            >
              <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)', margin: 0 }}>
                Playlist hochladen
              </h2>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { setCurrentFile(null); setUploadQueue([]); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.25rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                Datei: {currentFile.name}
                {uploadQueue.length > 0 && ` (noch ${uploadQueue.length} weitere)`}
              </p>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Anzeigename</span>
                <input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitUpload(); } }} style={inputStyle} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Kategorie</span>
                <select
                  value={uploadCategoryId ?? ''}
                  onChange={(e) => setUploadCategoryId(e.target.value === '' ? null : Number(e.target.value))}
                  style={inputStyle}
                >
                  <option value="">Ohne Kategorie</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Neue Kategorie anlegen…"
                  value={uploadNewCatName}
                  onChange={(e) => setUploadNewCatName(e.target.value)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = uploadNewCatName.trim();
                    if (name) createCategoryInlineMutation.mutate(name);
                  }}
                  disabled={!uploadNewCatName.trim() || createCategoryInlineMutation.isPending}
                  style={{ ...secondaryBtn, whiteSpace: 'nowrap' }}
                >
                  Anlegen
                </button>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>DJ</span>
                <select
                  value={uploadDjId ?? ''}
                  onChange={(e) => setUploadDjId(e.target.value === '' ? null : Number(e.target.value))}
                  style={inputStyle}
                >
                  <option value="">Ohne DJ</option>
                  {djs.map((dj) => (
                    <option key={dj.id} value={dj.id}>{dj.name}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Neuen DJ anlegen…"
                  value={uploadNewDjName}
                  onChange={(e) => setUploadNewDjName(e.target.value)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = uploadNewDjName.trim();
                    if (name) createDjInlineMutation.mutate(name);
                  }}
                  disabled={!uploadNewDjName.trim() || createDjInlineMutation.isPending}
                  style={{ ...secondaryBtn, whiteSpace: 'nowrap' }}
                >
                  Anlegen
                </button>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Jahr</span>
                <input
                  type="number"
                  placeholder="z. B. 2026"
                  value={uploadYear}
                  onChange={(e) => setUploadYear(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitUpload(); } }}
                  style={inputStyle}
                />
              </label>

              {uploadError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-error)', margin: 0 }}>{uploadError}</p>}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => startNextUpload(uploadQueue)}
                  style={{
                    background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '0.5rem', padding: '0.5rem 1rem',
                    fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', cursor: 'pointer',
                  }}
                >
                  Überspringen
                </button>
                <button
                  type="button"
                  onClick={() => uploadMutation.mutate()}
                  disabled={!uploadTitle.trim() || uploadMutation.isPending}
                  style={{ ...gradientBtn, opacity: uploadMutation.isPending ? 0.7 : 1, cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer' }}
                >
                  {uploadMutation.isPending ? 'Lädt hoch…' : 'Hochladen'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bearbeiten-Dialog */}
      {editTarget && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
          <div
            data-draggable-modal
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '380px',
              background: 'var(--color-surface-container-high)',
              border: '1px solid rgba(148,170,255,0.25)',
              borderRadius: '0.75rem',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(148,170,255,0.05)',
              zIndex: 50, ...editModalStyle,
            }}
          >
            <div
              onMouseDown={editDragDown}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148,170,255,0.12)',
                ...editHeaderStyle,
              }}
            >
              <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)', margin: 0 }}>
                Playlist bearbeiten
              </h2>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setEditTarget(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.25rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Anzeigename</span>
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitEdit(); } }} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Kategorie</span>
                <select
                  value={editCategoryId ?? ''}
                  onChange={(e) => setEditCategoryId(e.target.value === '' ? null : Number(e.target.value))}
                  style={inputStyle}
                >
                  <option value="">Ohne Kategorie</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>DJ</span>
                <select
                  value={editDjId ?? ''}
                  onChange={(e) => setEditDjId(e.target.value === '' ? null : Number(e.target.value))}
                  style={inputStyle}
                >
                  <option value="">Ohne DJ</option>
                  {djs.map((dj) => (
                    <option key={dj.id} value={dj.id}>{dj.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Jahr</span>
                <input
                  type="number"
                  placeholder="z. B. 2026"
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitEdit(); } }}
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  style={{
                    background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '0.5rem', padding: '0.5rem 1rem',
                    fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateMutation.mutate({
                      title: editTitle.trim(),
                      category_id: editCategoryId,
                      dj_id: editDjId,
                      year: editYear.trim() === '' ? null : Number(editYear),
                    })
                  }
                  disabled={!editTitle.trim() || updateMutation.isPending}
                  style={{ ...gradientBtn, opacity: updateMutation.isPending ? 0.7 : 1, cursor: updateMutation.isPending ? 'not-allowed' : 'pointer' }}
                >
                  {updateMutation.isPending ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Kategorien-Dialog */}
      {showCategories && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
          <div
            data-draggable-modal
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '420px',
              background: 'var(--color-surface-container-high)',
              border: '1px solid rgba(148,170,255,0.25)',
              borderRadius: '0.75rem',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(148,170,255,0.05)',
              zIndex: 50, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              ...catModalStyle,
            }}
          >
            <div
              onMouseDown={catDragDown}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148,170,255,0.12)', flexShrink: 0,
                ...catHeaderStyle,
              }}
            >
              <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)', margin: 0 }}>
                Kategorien &amp; DJs
              </h2>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowCategories(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.25rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                Kategorien
              </h3>
              {categories.length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                  Noch keine Kategorien angelegt.
                </p>
              )}
              {categories.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {renameCategoryId === c.id ? (
                    <input
                      type="text"
                      value={renameCategoryName}
                      onChange={(e) => setRenameCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameCategoryName.trim()) {
                          renameCategoryMutation.mutate({ id: c.id, name: renameCategoryName.trim() });
                        }
                        if (e.key === 'Escape') { setRenameCategoryId(null); setRenameCategoryName(''); }
                      }}
                      autoFocus
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                      {c.name}
                    </span>
                  )}
                  {renameCategoryId === c.id ? (
                    <button
                      onClick={() => renameCategoryName.trim() && renameCategoryMutation.mutate({ id: c.id, name: renameCategoryName.trim() })}
                      title="Speichern"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: '0.25rem', display: 'flex' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>check</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => { setRenameCategoryId(c.id); setRenameCategoryName(c.name); }}
                      title="Umbenennen"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: '0.25rem', display: 'flex' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>edit</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteCategory(c)}
                    title="Löschen"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: '0.25rem', display: 'flex' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>delete</span>
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid rgba(148,170,255,0.12)', paddingTop: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="Neue Kategorie…"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategoryName.trim()) createCategoryMutation.mutate(newCategoryName.trim());
                  }}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => newCategoryName.trim() && createCategoryMutation.mutate(newCategoryName.trim())}
                  disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                  style={{ ...secondaryBtn, whiteSpace: 'nowrap' }}
                >
                  Anlegen
                </button>
              </div>

              <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', margin: '0.5rem 0 0', borderTop: '1px solid rgba(148,170,255,0.12)', paddingTop: '0.75rem' }}>
                DJs
              </h3>
              {djs.length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                  Noch keine DJs angelegt.
                </p>
              )}
              {djs.map((dj) => (
                <div key={dj.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {renameDjId === dj.id ? (
                    <input
                      type="text"
                      value={renameDjName}
                      onChange={(e) => setRenameDjName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameDjName.trim()) {
                          renameDjMutation.mutate({ id: dj.id, name: renameDjName.trim() });
                        }
                        if (e.key === 'Escape') { setRenameDjId(null); setRenameDjName(''); }
                      }}
                      autoFocus
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                      {dj.name}
                    </span>
                  )}
                  {renameDjId === dj.id ? (
                    <button
                      onClick={() => renameDjName.trim() && renameDjMutation.mutate({ id: dj.id, name: renameDjName.trim() })}
                      title="Speichern"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: '0.25rem', display: 'flex' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>check</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => { setRenameDjId(dj.id); setRenameDjName(dj.name); }}
                      title="Umbenennen"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: '0.25rem', display: 'flex' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>edit</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteDj(dj)}
                    title="Löschen"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: '0.25rem', display: 'flex' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>delete</span>
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid rgba(148,170,255,0.12)', paddingTop: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="Neuen DJ…"
                  value={newDjName}
                  onChange={(e) => setNewDjName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDjName.trim()) createDjMutation.mutate(newDjName.trim());
                  }}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => newDjName.trim() && createDjMutation.mutate(newDjName.trim())}
                  disabled={!newDjName.trim() || createDjMutation.isPending}
                  style={{ ...secondaryBtn, whiteSpace: 'nowrap' }}
                >
                  Anlegen
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {viewerPlaylist && (
        <PlaylistViewerOverlay playlist={viewerPlaylist} onClose={() => setViewerPlaylist(null)} />
      )}
    </PageWrapper>
  );
}
