/**
 * DocumentsPage — zentrale Dokumentenablage (Dokumente-Modul).
 *
 * Eine Komponente, optionale areaSlug-Prop:
 *  - <DocumentsPage />                    -> /dokumente (alle Bereiche, virtuelle Wurzel)
 *  - <DocumentsPage areaSlug="amazon" />   -> /amazon/dokumente (fest auf Bereich eingegrenzt)
 *  - <DocumentsPage areaSlug="dj" />       -> /dj/dokumente
 *  - <DocumentsPage areaSlug="finanzen" /> -> /finances/dokumente
 *
 * Siehe docs/superpowers/specs/2026-07-04-dokumente-modul-design.md
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { FilePreviewModal, useFilePreview } from '../../components/amazon/FilePreviewModal';
import { MoveModal } from '../../components/documents/MoveModal';
import {
  fetchDocTree,
  fetchFolderContents,
  createFolder,
  updateFolder,
  deleteFolder,
  uploadDocFiles,
  updateFile,
  deleteFile,
  fetchDocUsage,
  rebuildMirror,
  fetchDocSettings,
  updateDocSettings,
  fetchDocFileBlobUrl,
  type DocFolder,
  type DocFile,
} from '../../api/documents.api';

interface DocumentsPageProps {
  areaSlug?: 'amazon' | 'dj' | 'finanzen' | 'privat';
}

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.scr', '.com', '.msi', '.js', '.vbs'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function mimeIcon(mime: string | null): string {
  if (!mime) return 'description';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'picture_as_pdf';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'text/csv'
  ) {
    return 'table_chart';
  }
  return 'draft';
}

const AREA_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  dj: 'DJ',
  finanzen: 'Finanzen',
  privat: 'Privat',
};

/** Zählt Dateien und Ordner rekursiv über den flachen Baum (inkl. des Ordners selbst). */
function countFolderContents(
  tree: DocFolder[],
  rootId: number,
): { files: number; folders: number } {
  let files = 0;
  let folders = 0;
  const walk = (id: number) => {
    folders += 1;
    files += tree.find((f) => f.id === id)?.file_count ?? 0;
    for (const child of tree.filter((f) => f.parent_id === id)) walk(child.id);
  };
  walk(rootId);
  return { files, folders };
}

export function DocumentsPage({ areaSlug }: DocumentsPageProps) {
  const queryClient = useQueryClient();
  const { preview, open: openPreview, close: closePreview } = useFilePreview();

  const { data: tree = [] } = useQuery({ queryKey: ['dokumente', 'tree'], queryFn: fetchDocTree });
  const { data: usage } = useQuery({ queryKey: ['dokumente', 'usage'], queryFn: fetchDocUsage });

  const areaRoot = useMemo(() => {
    if (!areaSlug) return null;
    return tree.find((f) => f.is_area_root === 1 && f.area_slug === areaSlug) ?? null;
  }, [tree, areaSlug]);

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<{ kind: 'folder' | 'file'; id: number } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<{ kind: 'folder' | 'file'; id: number } | null>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effektiver aktueller Ordner: bei areaSlug fix auf den Bereichs-Root falls noch nicht navigiert
  const effectiveFolderId = currentFolderId ?? (areaSlug ? areaRoot?.id ?? null : null);

  const isVirtualRoot = !areaSlug && effectiveFolderId === null;

  const { data: contents } = useQuery({
    queryKey: ['dokumente', 'folder', effectiveFolderId],
    queryFn: () => fetchFolderContents(effectiveFolderId!),
    enabled: effectiveFolderId !== null,
  });

  const { data: settings } = useQuery({
    queryKey: ['dokumente', 'settings'],
    queryFn: fetchDocSettings,
    enabled: settingsOpen,
  });

  const [budgetInput, setBudgetInput] = useState('');
  const [mirrorInput, setMirrorInput] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  if (settings && !settingsLoaded) {
    setBudgetInput(settings.dokumente_budget_mb);
    setMirrorInput(settings.dokumente_mirror_path);
    setSettingsLoaded(true);
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['dokumente', 'tree'] });
    queryClient.invalidateQueries({ queryKey: ['dokumente', 'folder'] });
    queryClient.invalidateQueries({ queryKey: ['dokumente', 'usage'] });
  }

  const createFolderMut = useMutation({
    mutationFn: ({ parentId, name }: { parentId: number; name: string }) => createFolder(parentId, name),
    onSuccess: invalidateAll,
  });
  const updateFolderMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; parent_id?: number } }) =>
      updateFolder(id, data),
    onSuccess: invalidateAll,
  });
  const deleteFolderMut = useMutation({
    mutationFn: (id: number) => deleteFolder(id),
    onSuccess: invalidateAll,
  });
  const uploadMut = useMutation({
    mutationFn: ({ folderId, files }: { folderId: number; files: File[] }) => uploadDocFiles(folderId, files),
    onSuccess: invalidateAll,
  });
  const updateFileMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { filename?: string; folder_id?: number } }) =>
      updateFile(id, data),
    onSuccess: invalidateAll,
  });
  const deleteFileMut = useMutation({
    mutationFn: (id: number) => deleteFile(id),
    onSuccess: invalidateAll,
  });
  const settingsMut = useMutation({
    mutationFn: (updates: Record<string, string>) => updateDocSettings(updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dokumente', 'settings'] }),
  });
  const rebuildMut = useMutation({ mutationFn: rebuildMirror });

  // ── Navigation ────────────────────────────────────────────────────────

  const breadcrumb = useMemo(() => {
    const segments: DocFolder[] = [];
    let cursor = effectiveFolderId;
    let guard = 0;
    while (cursor !== null && guard < 50) {
      guard++;
      const f = tree.find((t) => t.id === cursor);
      if (!f) break;
      segments.unshift(f);
      cursor = f.parent_id;
    }
    return segments;
  }, [tree, effectiveFolderId]);

  function navigateTo(id: number | null) {
    setCurrentFolderId(id);
    setNewFolderOpen(false);
    setRenamingId(null);
  }

  function goBack() {
    if (effectiveFolderId === null) return;
    const current = tree.find((f) => f.id === effectiveFolderId);
    if (!current) return;
    if (areaSlug && current.is_area_root) return; // kein Hochnavigieren ueber Bereichs-Wurzel
    navigateTo(current.parent_id);
  }

  const canGoBack = areaSlug
    ? effectiveFolderId !== null && effectiveFolderId !== areaRoot?.id
    : effectiveFolderId !== null;

  // Wurzel-Bereichsordner fuer virtuelle Startseite (/dokumente ohne areaSlug)
  const areaRoots = useMemo(() => tree.filter((f) => f.is_area_root === 1), [tree]);

  // ── Upload ────────────────────────────────────────────────────────────

  async function handleUpload(files: File[]) {
    if (effectiveFolderId === null || files.length === 0) return;
    const rejected = files.filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      return BLOCKED_EXTENSIONS.includes(ext);
    });
    const accepted = files.filter((f) => !rejected.includes(f));
    if (rejected.length > 0) {
      alert(`Nicht erlaubter Dateityp: ${rejected.map((f) => f.name).join(', ')}`);
    }
    if (accepted.length === 0) return;
    setUploading(accepted.map((f) => f.name));
    try {
      await uploadMut.mutateAsync({ folderId: effectiveFolderId, files: accepted });
    } finally {
      setUploading([]);
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    multiple: true,
    noClick: true,
    disabled: effectiveFolderId === null,
  });

  // ── Preview ───────────────────────────────────────────────────────────

  async function handlePreview(file: DocFile) {
    const url = await fetchDocFileBlobUrl(file.id);
    openPreview(url, file.mime_type, file.filename);
  }

  // ── Titel ─────────────────────────────────────────────────────────────

  const title = areaSlug ? `Dokumente — ${AREA_LABELS[areaSlug] ?? areaSlug}` : 'Dokumente';

  const usedMb = usage ? usage.usedBytes / (1024 * 1024) : 0;
  const budgetMb = usage?.budgetMb ?? 1024;
  const percent = budgetMb > 0 ? (usedMb / budgetMb) * 100 : 0;
  const overBudget = percent > 100;

  return (
    <PageWrapper>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '0.625rem',
                background: 'var(--color-surface-container-high)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: 'var(--color-primary)', fontSize: 32 }}
              >
                storage
              </span>
            </div>
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-headline)',
                  fontWeight: 800,
                  fontSize: '1.75rem',
                  color: 'var(--color-on-surface)',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                {title}
              </h1>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface-variant)',
                  marginTop: '0.25rem',
                  margin: '0.25rem 0 0 0',
                }}
              >
                Verwalte deine Dateien und Ordner (Budget:{' '}
                {budgetMb >= 1024
                  ? `${(budgetMb / 1024).toFixed(budgetMb % 1024 === 0 ? 0 : 1)} GB`
                  : `${budgetMb} MB`}
                )
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                handleUpload(files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={effectiveFolderId === null}
              title={effectiveFolderId === null ? 'Wähle zuerst einen Ordner oder Bereich' : undefined}
              className="px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                opacity: effectiveFolderId === null ? 0.5 : 1,
                cursor: effectiveFolderId === null ? 'not-allowed' : 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload</span>
              Dateien hochladen
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className="p-2 rounded-md"
              style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }}
              aria-label="Einstellungen"
              title="Einstellungen"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </div>

        {/* Einstellungs-Panel */}
        {settingsOpen && (
          <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)' }}
          >
            <div className="flex items-center gap-3">
              <label className="text-sm w-56" style={{ color: 'var(--color-on-surface-variant)' }}>
                Speicher-Budget (MB)
              </label>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onBlur={() => settingsMut.mutate({ dokumente_budget_mb: budgetInput })}
                className="px-2 py-1 rounded text-sm w-40"
                style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm w-56" style={{ color: 'var(--color-on-surface-variant)' }}>
                Spiegel-Pfad (leer = Spiegel aus)
              </label>
              <input
                type="text"
                value={mirrorInput}
                onChange={(e) => setMirrorInput(e.target.value)}
                onBlur={() => settingsMut.mutate({ dokumente_mirror_path: mirrorInput })}
                className="px-2 py-1 rounded text-sm flex-1"
                style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }}
              />
            </div>
            <div>
              <button
                type="button"
                onClick={() => rebuildMut.mutate()}
                className="px-3 py-1.5 rounded-md text-sm"
                style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
              >
                {rebuildMut.isPending ? 'Spiegel wird aufgebaut…' : 'Spiegel neu aufbauen'}
              </button>
              {rebuildMut.isSuccess && (
                <span className="ml-2 text-xs" style={{ color: 'var(--color-secondary)' }}>Fertig.</span>
              )}
            </div>
          </div>
        )}

        {/* Speicher-Nutzungs-Karte */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>Speicher-Nutzung</span>
            <span
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: 9999,
                background: overBudget
                  ? 'color-mix(in srgb, var(--color-error) 20%, transparent)'
                  : 'var(--color-surface-container-high)',
                color: overBudget ? 'var(--color-error)' : 'var(--color-on-surface)',
                fontSize: '0.8rem',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {usedMb.toFixed(usedMb < 10 ? 1 : 0)} MB / {budgetMb >= 1024 ? `${(budgetMb / 1024).toFixed(1)} GB` : `${budgetMb} MB`}
            </span>
          </div>
          <div
            className="w-full rounded-full overflow-hidden mt-2"
            style={{ height: 8, background: 'var(--color-surface-container-low)' }}
          >
            <div
              style={{
                width: `${Math.min(percent, 100)}%`,
                height: '100%',
                background: overBudget ? 'var(--color-error)' : 'var(--color-primary)',
                transition: 'width 0.3s',
              }}
            />
          </div>
          <p
            style={{
              fontSize: '0.75rem',
              color: overBudget ? 'var(--color-error)' : 'var(--color-on-surface-variant)',
              marginTop: '0.5rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {percent.toFixed(0)}% verwendet · {formatBytes(Math.max(0, usage ? usage.budgetMb * 1024 * 1024 - usage.usedBytes : 0))} verfügbar
          </p>
        </div>

        {/* Breadcrumb */}
        {!isVirtualRoot && (
          <div className="flex items-center gap-2 flex-wrap">
            {canGoBack && (
              <button
                type="button"
                onClick={goBack}
                className="px-2 py-1 rounded-md text-sm flex items-center gap-1"
                style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Zurück
              </button>
            )}
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface-variant)' }}>
              folder
            </span>
            {!areaSlug && (
              <button
                type="button"
                onClick={() => navigateTo(null)}
                className="text-sm"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                Dokumente
              </button>
            )}
            {breadcrumb.map((seg) => (
              <span key={seg.id} className="flex items-center gap-2 text-sm">
                <span style={{ color: 'var(--color-on-surface-variant)' }}>/</span>
                <button
                  type="button"
                  onClick={() => navigateTo(seg.id)}
                  style={{
                    color: seg.id === effectiveFolderId ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                    fontWeight: seg.id === effectiveFolderId ? 600 : 400,
                  }}
                >
                  {seg.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Inhalts-Karte */}
        <div
          {...getRootProps()}
          className="rounded-xl p-4 flex flex-col gap-2"
          style={{
            background: 'var(--color-surface-container)',
            border: `1px solid ${isDragActive ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
            minHeight: 200,
          }}
        >
          <input {...getInputProps()} />

          {isVirtualRoot ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold mb-1" style={{ color: 'var(--color-on-surface)' }}>Bereiche</span>
              {areaRoots.map((root) => (
                <button
                  key={root.id}
                  type="button"
                  onClick={() => navigateTo(root.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                  style={{ background: 'var(--color-surface-container-low)', border: '1px solid var(--color-outline-variant)' }}
                >
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>folder</span>
                  <span className="flex-1" style={{ color: 'var(--color-on-surface)' }}>{root.name}</span>
                  <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{root.file_count} Dateien</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setNewFolderOpen(true);
                    setNewFolderName('');
                  }}
                  className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>create_new_folder</span>
                  Neuer Ordner
                </button>
              </div>

              {newFolderOpen && (
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim() && effectiveFolderId !== null) {
                      createFolderMut.mutate({ parentId: effectiveFolderId, name: newFolderName.trim() });
                      setNewFolderOpen(false);
                    } else if (e.key === 'Escape') {
                      setNewFolderOpen(false);
                    }
                  }}
                  onBlur={() => setNewFolderOpen(false)}
                  placeholder="Ordnername…"
                  className="px-3 py-2 rounded-md text-sm"
                  style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-primary)' }}
                />
              )}

              {uploading.length > 0 && (
                <div className="flex flex-col gap-1 mb-1">
                  {uploading.map((name) => (
                    <span key={name} className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {name} wird hochgeladen…
                    </span>
                  ))}
                </div>
              )}

              {contents && contents.folders.length === 0 && contents.files.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--color-on-surface-variant)' }}>
                    folder_open
                  </span>
                  <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Dieser Ordner ist leer.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-md text-sm font-semibold"
                    style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
                  >
                    Dateien hochladen
                  </button>
                </div>
              )}

              {contents?.folders.map((folder) => (
                <div key={folder.id} className="group flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/[0.03]">
                  {renamingId?.kind === 'folder' && renamingId.id === folder.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameValue.trim()) {
                          updateFolderMut.mutate({ id: folder.id, data: { name: renameValue.trim() } });
                          setRenamingId(null);
                        } else if (e.key === 'Escape') {
                          setRenamingId(null);
                        }
                      }}
                      onBlur={() => setRenamingId(null)}
                      className="flex-1 px-2 py-1 rounded text-sm"
                      style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-primary)' }}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => navigateTo(folder.id)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>folder</span>
                        <span style={{ color: 'var(--color-on-surface)' }}>{folder.name}</span>
                        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{folder.file_count} Dateien</span>
                      </button>
                      {!folder.is_area_root && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="Umbenennen"
                            onClick={() => {
                              setRenamingId({ kind: 'folder', id: folder.id });
                              setRenameValue(folder.name);
                            }}
                            className="p-1 rounded hover:bg-white/5"
                            style={{ color: 'var(--color-on-surface-variant)' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                          </button>
                          <button
                            type="button"
                            title="Verschieben"
                            onClick={() => setMoveTarget({ kind: 'folder', id: folder.id })}
                            className="p-1 rounded hover:bg-white/5"
                            style={{ color: 'var(--color-on-surface-variant)' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>drive_file_move</span>
                          </button>
                          <button
                            type="button"
                            title="Löschen"
                            onClick={() => {
                              const counts = countFolderContents(tree, folder.id);
                              if (
                                confirm(
                                  counts.folders > 1
                                    ? `Ordner „${folder.name}" enthält ${counts.files} Dateien in ${counts.folders} Ordnern. Wirklich löschen?`
                                    : `Ordner „${folder.name}" enthält ${counts.files} Dateien. Wirklich löschen?`,
                                )
                              ) {
                                deleteFolderMut.mutate(folder.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-white/5"
                            style={{ color: 'var(--color-error)' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {contents?.files.map((file) => (
                <div key={file.id} className="group flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/[0.03]">
                  {renamingId?.kind === 'file' && renamingId.id === file.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameValue.trim()) {
                          updateFileMut.mutate({ id: file.id, data: { filename: renameValue.trim() } });
                          setRenamingId(null);
                        } else if (e.key === 'Escape') {
                          setRenamingId(null);
                        }
                      }}
                      onBlur={() => setRenamingId(null)}
                      className="flex-1 px-2 py-1 rounded text-sm"
                      style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-primary)' }}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePreview(file)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)' }}>
                          {mimeIcon(file.mime_type)}
                        </span>
                        <span style={{ color: 'var(--color-on-surface)' }}>{file.filename}</span>
                        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                          {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Umbenennen"
                          onClick={() => {
                            setRenamingId({ kind: 'file', id: file.id });
                            setRenameValue(file.filename);
                          }}
                          className="p-1 rounded hover:bg-white/5"
                          style={{ color: 'var(--color-on-surface-variant)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                        </button>
                        <button
                          type="button"
                          title="Verschieben"
                          onClick={() => setMoveTarget({ kind: 'file', id: file.id })}
                          className="p-1 rounded hover:bg-white/5"
                          style={{ color: 'var(--color-on-surface-variant)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>drive_file_move</span>
                        </button>
                        <button
                          type="button"
                          title="Löschen"
                          onClick={() => {
                            if (confirm(`Datei „${file.filename}" wirklich löschen?`)) {
                              deleteFileMut.mutate(file.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-white/5"
                          style={{ color: 'var(--color-error)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <MoveModal
        open={moveTarget !== null}
        tree={tree}
        excludeId={moveTarget?.kind === 'folder' ? moveTarget.id : null}
        onClose={() => setMoveTarget(null)}
        onSelect={(targetFolderId) => {
          if (!moveTarget) return;
          if (moveTarget.kind === 'folder') {
            updateFolderMut.mutate({ id: moveTarget.id, data: { parent_id: targetFolderId } });
          } else {
            updateFileMut.mutate({ id: moveTarget.id, data: { folder_id: targetFolderId } });
          }
          setMoveTarget(null);
        }}
      />

      <FilePreviewModal preview={preview} onClose={closePreview} />
    </PageWrapper>
  );
}
