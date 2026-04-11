import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {
  updatePage, togglePin, toggleArchive, toggleTemplate,
  fetchAttachments, uploadAttachment, deleteAttachment, getAttachmentDownloadUrl,
  type Page, type Attachment,
} from '../../api/workbook.api';
import type { SaveStatus } from '../../pages/WorkbookPage';

interface WorkbookEditorProps {
  page: Page;
  onSaveStatusChange: (s: SaveStatus) => void;
  saveStatus: SaveStatus;
  onPageUpdated: (p: Page) => void;
}

function statusText(s: SaveStatus): string {
  if (s === 'saving') return 'Wird gespeichert...';
  if (s === 'saved') return 'Gespeichert';
  if (s === 'error') return 'Fehler beim Speichern';
  return '';
}

function statusColor(s: SaveStatus): string {
  if (s === 'saving') return 'var(--color-primary)';
  if (s === 'saved') return 'var(--color-on-surface-variant)';
  if (s === 'error') return 'var(--color-error)';
  return 'var(--color-on-surface-variant)';
}

type ToolbarPayload = {
  content: ReturnType<NonNullable<ReturnType<typeof useEditor>>['getJSON']> | undefined;
  title: string;
  tags: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkbookEditor({ page, onSaveStatusChange, saveStatus, onPageUpdated }: WorkbookEditorProps) {
  const [title, setTitle] = useState(page.title);
  const [tags, setTags] = useState(page.tags ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const latestPayloadRef = useRef<ToolbarPayload | null>(null);
  // Refs so onUpdate always reads the current title/tags without stale closure
  const titleRef = useRef(page.title);
  const tagsRef = useRef(page.tags ?? '');

  const doSave = useCallback(async (silent = false) => {
    const payload = latestPayloadRef.current;
    if (!payload) return;
    try {
      if (!silent) onSaveStatusChange('saving');
      if (pendingSaveRef.current) await pendingSaveRef.current;
      const p = updatePage(page.id, {
        title: payload.title,
        content: payload.content,
        tags: payload.tags,
      }).then((updated) => {
        onPageUpdated(updated);
        if (!silent) onSaveStatusChange('saved');
      }).catch(() => {
        if (!silent) onSaveStatusChange('error');
      });
      pendingSaveRef.current = p;
      await p;
      pendingSaveRef.current = null;
    } catch {
      if (!silent) onSaveStatusChange('error');
    }
  }, [page.id, onSaveStatusChange, onPageUpdated]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(doSave, 1500) as unknown as number;
  }, [doSave]);

  // Load attachments when page changes
  useEffect(() => {
    fetchAttachments(page.id).then(setAttachments).catch(() => {});
  }, [page.id]);

  async function handleUploadFiles(files: FileList | File[]) {
    if (uploading) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const att = await uploadAttachment(page.id, file);
        setAttachments((prev) => [...prev, att]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteAttachment(id: number) {
    if (!window.confirm('Anhang wirklich löschen?')) return;
    await deleteAttachment(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} Anhang/Anhänge wirklich löschen?`)) return;
    await Promise.all([...selectedIds].map((id) => deleteAttachment(id)));
    setAttachments((prev) => prev.filter((a) => !selectedIds.has(a.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: 'Hier tippen — Seite bearbeiten...' }),
      CharacterCount,
    ],
    content: (() => {
      try {
        return typeof page.content === 'string' ? JSON.parse(page.content) : page.content;
      } catch {
        return page.content;
      }
    })(),
    onUpdate: ({ editor: ed }) => {
      const content = ed.getJSON();
      latestPayloadRef.current = { content, title: titleRef.current, tags: tagsRef.current };
      scheduleSave();
    },
  }, [page.id]);

  // Destroy cleanup
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  // Sync title/tags when page changes; reset select mode
  useEffect(() => {
    setTitle(page.title);
    titleRef.current = page.title;
    setTags(page.tags ?? '');
    tagsRef.current = page.tags ?? '';
    latestPayloadRef.current = null;
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [page.id]);

  // Unmount / page switch: cancel timer + immediate save
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (latestPayloadRef.current) {
        doSave(true);
        latestPayloadRef.current = null;
      }
    };
  }, [page.id, doSave]);

  async function handleTogglePin() {
    const updated = await togglePin(page.id);
    onPageUpdated(updated);
  }

  async function handleToggleArchive() {
    const updated = await toggleArchive(page.id);
    onPageUpdated(updated);
  }

  async function handleToggleTemplate() {
    const updated = await toggleTemplate(page.id);
    onPageUpdated(updated);
  }

  function handleAddLink() {
    if (!editor) return;
    const url = window.prompt('URL eingeben:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  const toolbarBtn = (active: boolean, onClick: () => void, icon: string, title: string) => (
    <button
      key={icon + title}
      onClick={onClick}
      title={title}
      style={{
        padding: '0.3rem 0.45rem',
        background: active ? 'rgba(204,151,255,0.15)' : 'transparent',
        border: 'none',
        borderRadius: '0.3rem',
        cursor: 'pointer',
        color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
        fontSize: '0.85rem',
        fontFamily: 'var(--font-body)',
        fontWeight: active ? 700 : 400,
        transition: 'background 0.1s',
      }}
    >
      {icon}
    </button>
  );

  const iconBtn = (active: boolean, onClick: () => void, materialIcon: string, title: string) => (
    <button
      key={materialIcon + title}
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0.3rem',
        background: active ? 'rgba(204,151,255,0.15)' : 'transparent',
        border: 'none',
        borderRadius: '0.3rem',
        cursor: 'pointer',
        color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
        transition: 'background 0.1s',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>{materialIcon}</span>
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-surface)' }}>
      {/* Toolbar */}
      <div
        style={{
          borderBottom: '1px solid var(--color-outline-variant)',
          padding: '0.5rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.15rem',
          flexWrap: 'wrap',
        }}
      >
        {toolbarBtn(editor?.isActive('bold') ?? false, () => editor?.chain().focus().toggleBold().run(), 'B', 'Fett')}
        {toolbarBtn(editor?.isActive('italic') ?? false, () => editor?.chain().focus().toggleItalic().run(), 'I', 'Kursiv')}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {toolbarBtn(editor?.isActive('heading', { level: 1 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), 'H1', 'Überschrift 1')}
        {toolbarBtn(editor?.isActive('heading', { level: 2 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', 'Überschrift 2')}
        {toolbarBtn(editor?.isActive('heading', { level: 3 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), 'H3', 'Überschrift 3')}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {iconBtn(editor?.isActive('bulletList') ?? false, () => editor?.chain().focus().toggleBulletList().run(), 'format_list_bulleted', 'Aufzählung')}
        {iconBtn(editor?.isActive('orderedList') ?? false, () => editor?.chain().focus().toggleOrderedList().run(), 'format_list_numbered', 'Nummerierte Liste')}
        {iconBtn(editor?.isActive('taskList') ?? false, () => editor?.chain().focus().toggleTaskList().run(), 'checklist', 'Checkliste')}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {iconBtn(editor?.isActive('blockquote') ?? false, () => editor?.chain().focus().toggleBlockquote().run(), 'format_quote', 'Zitat')}
        {iconBtn(editor?.isActive('code') ?? false, () => editor?.chain().focus().toggleCode().run(), 'code', 'Code')}
        {iconBtn(editor?.isActive('link') ?? false, handleAddLink, 'link', 'Link einfügen')}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Page actions */}
        {iconBtn(page.is_pinned === 1, handleTogglePin, 'push_pin', page.is_pinned ? 'Pin entfernen' : 'Pinnen')}
        {iconBtn(page.is_archived === 1, handleToggleArchive, 'archive', page.is_archived ? 'Archivierung aufheben' : 'Archivieren')}
        {iconBtn(page.is_template === 1, handleToggleTemplate, 'bookmark', page.is_template ? 'Vorlage entfernen' : 'Als Vorlage')}
      </div>

      {/* Title */}
      <div style={{ padding: '1.5rem 0 0.5rem' }}>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            latestPayloadRef.current = {
              content: editor?.getJSON(),
              title: e.target.value,
              tags: tagsRef.current,
            };
            scheduleSave();
          }}
          placeholder="Unbenannte Seite"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: '2rem',
            letterSpacing: '-0.02em',
            color: 'var(--color-on-surface)',
            padding: '0 2rem',
            boxSizing: 'border-box',
          }}
        />

        {/* Tags */}
        <input
          value={tags}
          onChange={(e) => {
            setTags(e.target.value);
            tagsRef.current = e.target.value;
            latestPayloadRef.current = {
              content: editor?.getJSON(),
              title: titleRef.current,
              tags: e.target.value,
            };
            scheduleSave();
          }}
          placeholder="Tags (kommagetrennt)"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-on-surface-variant)',
            padding: '0.25rem 2rem 0',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Editor with drag-and-drop */}
      <div
        style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) handleUploadFiles(e.dataTransfer.files);
        }}
      >
        <EditorContent editor={editor} />
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(204,151,255,0.08)',
            border: '2px dashed var(--color-primary)',
            borderRadius: '0.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ textAlign: 'center', color: 'var(--color-primary)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', display: 'block' }}>upload_file</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 600 }}>
                Dateien hier ablegen
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--color-outline-variant)',
          padding: '0.75rem 2rem',
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
        }}>
          {/* Header: Label + Auswahl-Kontrolle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-outline)' }}>
              Anhänge
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                    padding: '0.2rem 0.5rem',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '0.3rem',
                    cursor: 'pointer',
                    color: 'var(--color-error)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>delete</span>
                  Auswahl löschen ({selectedIds.size})
                </button>
              )}
              <button
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                title={selectMode ? 'Auswahl beenden' : 'Mehrere auswählen'}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '0.2rem',
                  background: selectMode ? 'rgba(204,151,255,0.15)' : 'transparent',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  color: selectMode ? 'var(--color-primary)' : 'var(--color-outline)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>checklist</span>
              </button>
            </div>
          </div>

          {attachments.map((att) => (
            <div
              key={att.id}
              onClick={() => {
                if (selectMode) {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(att.id)) next.delete(att.id); else next.add(att.id);
                    return next;
                  });
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                cursor: selectMode ? 'pointer' : 'default',
                padding: '0.1rem 0.25rem',
                borderRadius: '0.2rem',
                background: selectMode && selectedIds.has(att.id) ? 'rgba(204,151,255,0.08)' : 'transparent',
              }}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(att.id)}
                  onChange={() => {}}
                  style={{ accentColor: 'var(--color-primary)', width: '14px', height: '14px', flexShrink: 0, cursor: 'pointer' }}
                />
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                attach_file
              </span>
              <a
                href={getAttachmentDownloadUrl(att.id)}
                download={att.file_name}
                onClick={(e) => selectMode && e.preventDefault()}
                style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                {att.file_name}
              </a>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-outline)', flexShrink: 0 }}>
                {formatBytes(att.file_size)}
              </span>
              {!selectMode && (
                <button
                  onClick={() => handleDeleteAttachment(att.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.1rem', display: 'flex', alignItems: 'center', color: 'var(--color-error)', flexShrink: 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: '0.5rem 2rem',
          borderTop: '1px solid var(--color-outline-variant)',
          display: 'flex',
          gap: '1rem',
          fontSize: '0.75rem',
          color: 'var(--color-on-surface-variant)',
          alignItems: 'center',
        }}
      >
        <span>{editor?.storage.characterCount?.characters() ?? 0} Zeichen</span>
        <span>{editor?.storage.characterCount?.words() ?? 0} Wörter</span>
        <span style={{ marginLeft: 'auto', color: statusColor(saveStatus) }}>
          {statusText(saveStatus)}
        </span>
      </div>
    </div>
  );
}
