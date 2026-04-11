import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../../api/tasks.api';

// Convert UTC ISO (e.g. "2026-04-11 18:30:00" or "2026-04-11T18:30:00Z") to local datetime-local value "YYYY-MM-DDTHH:mm"
function toLocalInputValue(iso: string): string {
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" without timezone — treat as UTC
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert local datetime-local value back to UTC ISO for DB
function toUtcIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local); // interpreted as local time
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

const AREAS = ['DJ', 'Amazon', 'Finanzen', 'KI-Agenten', 'Privat', 'Sonstiges'];

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface-container-low)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  padding: '0.5rem 0.75rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-outline)',
  marginBottom: '0.375rem',
};

interface FormData {
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  area: string;
  due_date: string;
  start_date: string;
  reminder_at: string;
  tags: string;
  project_or_customer: string;
  notes: string;
  estimated_duration: string;
  status_note: string;
}

function taskToForm(task: Task | null): FormData {
  if (!task) {
    return {
      title: '', description: '', status: 'open', priority: 'medium',
      area: '', due_date: '', start_date: '', reminder_at: '', tags: '',
      project_or_customer: '', notes: '', estimated_duration: '', status_note: '',
    };
  }
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    area: task.area ?? '',
    due_date: task.due_date ?? '',
    start_date: task.start_date ?? '',
    reminder_at: task.reminder_at ? toLocalInputValue(task.reminder_at) : '',
    tags: task.tags ?? '',
    project_or_customer: task.project_or_customer ?? '',
    notes: task.notes ?? '',
    estimated_duration: task.estimated_duration != null ? String(task.estimated_duration) : '',
    status_note: task.status_note ?? '',
  };
}

interface TaskSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSave: (data: Partial<Task> & { title: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function TaskSlideOver({ isOpen, onClose, task, onSave, onDelete }: TaskSlideOverProps) {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(() => taskToForm(task));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset form when task changes or panel opens
  useEffect(() => {
    setForm(taskToForm(task));
  }, [task, isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        area: form.area || null,
        due_date: form.due_date || null,
        start_date: form.start_date || null,
        reminder_at: toUtcIso(form.reminder_at),
        has_reminder: form.reminder_at ? 1 : 0,
        tags: form.tags || null,
        project_or_customer: form.project_or_customer || null,
        notes: form.notes || null,
        estimated_duration: form.estimated_duration ? Number(form.estimated_duration) : null,
        status_note: form.status_note || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!window.confirm(`Aufgabe "${task.title}" wirklich löschen?`)) return;
    setDeleting(true);
    try {
      await onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  }

  const focusStyle = `
    .task-input:focus {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(204,151,255,0.15);
    }
  `;

  return (
    <>
      <style>{focusStyle}</style>
      {/* Overlay container */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* Backdrop */}
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 200ms ease',
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
        />

        {/* Panel */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(520px, 90vw)',
            transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
            background: 'var(--color-surface-container)',
            borderLeft: '1px solid var(--color-outline-variant)',
            overflowY: 'auto',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-outline-variant)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-primary)' }}>
                {task ? 'edit' : 'add_task'}
              </span>
              <h2 style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 700,
                fontSize: '1rem',
                letterSpacing: '0.04em',
                color: 'var(--color-on-surface)',
              }}>
                {task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-on-surface-variant)',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
            </button>
          </div>

          {/* Form */}
          <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Title */}
            <div>
              <label style={LABEL_STYLE}>Titel *</label>
              <input
                className="task-input"
                style={INPUT_STYLE}
                type="text"
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Aufgabentitel..."
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label style={LABEL_STYLE}>Beschreibung</label>
              <textarea
                className="task-input"
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '72px' }}
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                placeholder="Optionale Beschreibung..."
              />
            </div>

            {/* Status-Notiz */}
            <div>
              <label style={LABEL_STYLE}>Status-Notiz</label>
              <textarea
                className="task-input"
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '56px' }}
                value={form.status_note}
                onChange={(e) => handleChange('status_note', e.target.value)}
                rows={2}
                placeholder="Wartet auf / Naechster Schritt..."
              />
            </div>

            {/* Status + Priority row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={LABEL_STYLE}>Status</label>
                <select
                  className="task-input"
                  style={INPUT_STYLE}
                  value={form.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                >
                  <option value="open">Offen</option>
                  <option value="in_progress">In Arbeit</option>
                  <option value="waiting">Wartend</option>
                  <option value="done">Erledigt</option>
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Prioritaet</label>
                <select
                  className="task-input"
                  style={INPUT_STYLE}
                  value={form.priority}
                  onChange={(e) => handleChange('priority', e.target.value)}
                >
                  <option value="low">Niedrig</option>
                  <option value="medium">Mittel</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </div>
            </div>

            {/* Area */}
            <div>
              <label style={LABEL_STYLE}>Bereich</label>
              <select
                className="task-input"
                style={INPUT_STYLE}
                value={form.area}
                onChange={(e) => handleChange('area', e.target.value)}
              >
                <option value="">— kein Bereich —</option>
                {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Due date + Start date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={LABEL_STYLE}>Faelligkeitsdatum</label>
                <input
                  className="task-input"
                  style={INPUT_STYLE}
                  type="date"
                  value={form.due_date}
                  onChange={(e) => handleChange('due_date', e.target.value)}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Startdatum</label>
                <input
                  className="task-input"
                  style={INPUT_STYLE}
                  type="date"
                  value={form.start_date}
                  onChange={(e) => handleChange('start_date', e.target.value)}
                />
              </div>
            </div>

            {/* Erinnerung */}
            <div>
              <label style={LABEL_STYLE}>Erinnerung am</label>
              <input
                className="task-input"
                style={INPUT_STYLE}
                type="datetime-local"
                value={form.reminder_at}
                onChange={(e) => handleChange('reminder_at', e.target.value)}
              />
            </div>

            {/* Tags */}
            <div>
              <label style={LABEL_STYLE}>Tags</label>
              <input
                className="task-input"
                style={INPUT_STYLE}
                type="text"
                value={form.tags}
                onChange={(e) => handleChange('tags', e.target.value)}
                placeholder="z.B. design, dringend, review"
              />
            </div>

            {/* Project / Customer */}
            <div>
              <label style={LABEL_STYLE}>Projekt / Kunde</label>
              <input
                className="task-input"
                style={INPUT_STYLE}
                type="text"
                value={form.project_or_customer}
                onChange={(e) => handleChange('project_or_customer', e.target.value)}
                placeholder="Zugehoeriges Projekt oder Kunde..."
              />
            </div>

            {/* Notes */}
            <div>
              <label style={LABEL_STYLE}>Notizen</label>
              <textarea
                className="task-input"
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '96px' }}
                value={form.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={4}
                placeholder="Interne Notizen..."
              />
            </div>

            {/* Estimated duration */}
            <div>
              <label style={LABEL_STYLE}>Geschaetzte Dauer (Minuten)</label>
              <input
                className="task-input"
                style={INPUT_STYLE}
                type="number"
                min="0"
                value={form.estimated_duration}
                onChange={(e) => handleChange('estimated_duration', e.target.value)}
                placeholder="z.B. 60"
              />
            </div>

            {/* Arbeitsmappe-Link — nur anzeigen wenn task?.source_page_id gesetzt */}
            {task?.source_page_id && (
              <div>
                <label style={LABEL_STYLE}>Ursprung</label>
                <button
                  onClick={() => {
                    navigate('/arbeitsmappe', { state: { openPageId: task.source_page_id } });
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--color-surface-container-low)',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    color: 'var(--color-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', flexShrink: 0 }}>
                    menu_book
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.source_page_title ?? `Seite #${task.source_page_id}`}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', marginLeft: 'auto', flexShrink: 0, color: 'var(--color-on-surface-variant)' }}>
                    open_in_new
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-outline-variant)',
            flexShrink: 0,
            gap: '0.75rem',
          }}>
            {task ? (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  background: 'rgba(255,110,132,0.1)',
                  border: '1px solid rgba(255,110,132,0.25)',
                  color: 'var(--color-error)',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>delete</span>
                {deleting ? 'Wird gelöscht...' : 'Löschen'}
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.5rem 1.5rem',
                borderRadius: '9999px',
                background: form.title.trim()
                  ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))'
                  : 'rgba(255,255,255,0.08)',
                border: 'none',
                color: form.title.trim() ? '#000' : 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'background 200ms ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>save</span>
              {saving ? 'Wird gespeichert...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
