import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../../api/tasks.api';
import { fetchContacts, type Contact } from '../../api/contacts.api';

// Convert UTC ISO (e.g. "2026-04-11 18:30:00" or "2026-04-11T18:30:00Z") to local datetime-local value "YYYY-MM-DDTHH:mm"
function toLocalInputValue(iso: string): string {
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" without timezone — treat as UTC
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Normalize a raw time string (e.g. "1430", "9:3", "14:30") to "HH:MM"
function normalizeTime(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let h = '', m = '';
  if (digits.length <= 2) { h = digits; m = '00'; }
  else if (digits.length === 3) { h = digits[0]; m = digits.slice(1); }
  else { h = digits.slice(0, 2); m = digits.slice(2, 4); }
  const hh = Math.min(23, parseInt(h || '0', 10));
  const mm = Math.min(59, parseInt(m || '0', 10));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Build a UTC ISO string from a "YYYY-MM-DD" date and "HH:MM" time using the
// numeric Date constructor — avoids all string-parsing quirks across browsers.
function buildReminderIso(date: string, time: string): string | null {
  if (!date) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, hh || 8, mm || 0, 0).toISOString();
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
  reminder_date: string;
  reminder_time: string;
  tags: string;
  project_or_customer: string;
  notes: string;
  estimated_duration: string;
  status_note: string;
  contact_id: number | null;
  contact_name: string;
}

function taskToForm(task: Task | null, prefill?: { title?: string; area?: string; contact_id?: number; contact_name?: string }): FormData {
  let reminder_date = '';
  let reminder_time = '';
  if (task?.reminder_at) {
    const local = toLocalInputValue(task.reminder_at); // "YYYY-MM-DDTHH:mm"
    reminder_date = local.slice(0, 10);
    reminder_time = local.slice(11, 16);
  }
  if (!task) {
    return {
      title: prefill?.title ?? '', description: '', status: 'open', priority: 'medium',
      area: prefill?.area ?? '', due_date: '', start_date: '', reminder_at: '',
      reminder_date: '', reminder_time: '',
      tags: '', project_or_customer: '', notes: '', estimated_duration: '', status_note: '',
      contact_id: prefill?.contact_id ?? null,
      contact_name: prefill?.contact_name ?? '',
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
    reminder_date,
    reminder_time,
    tags: task.tags ?? '',
    project_or_customer: task.project_or_customer ?? '',
    notes: task.notes ?? '',
    estimated_duration: task.estimated_duration != null ? String(task.estimated_duration) : '',
    status_note: task.status_note ?? '',
    contact_id: task.contact_id ?? null,
    contact_name: task.contact_name ?? '',
  };
}

interface TaskSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSave: (data: Partial<Task> & { title: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  prefill?: { title?: string; area?: string; source_page_id?: number; source_page_title?: string; contact_id?: number; contact_name?: string };
}

export function TaskSlideOver({ isOpen, onClose, task, onSave, onDelete, prefill }: TaskSlideOverProps) {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(() => taskToForm(task));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Kontakt-Suche
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);

  // Draggable modal position (null = zentriert via CSS, {x,y} = manuell verschoben)
  const [modalPos, setModalPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  // Refs to always read the current DOM value at save time — guards against
  // native macOS date/time pickers not reliably firing onChange into React state.
  const reminderDateRef = useRef<HTMLInputElement>(null);
  const reminderTimeRef = useRef<HTMLInputElement>(null);

  // Reset form when task changes or panel opens; reset modal position
  useEffect(() => {
    setForm(taskToForm(task, prefill));
    setModalPos(null);
  }, [task, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Kontakt-Suche mit 300ms Debounce
  useEffect(() => {
    if (contactSearch.length < 2) {
      setContactResults([]);
      setContactDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await fetchContacts({ search: contactSearch, limit: 8 });
        setContactResults(result.data);
        setContactDropdownOpen(true);
      } catch {
        setContactResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch]);

  // Drag-Handler für das Modal
  function handleHeaderMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).closest('[data-modal]') as HTMLElement | null;
    const rect = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, initX: rect.left, initY: rect.top };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setModalPos({ x: dragRef.current.initX + dx, y: dragRef.current.initY + dy });
    }
    function onUp() {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;

    // Read actual DOM values at save time — guards against native macOS date pickers
    // not reliably firing React synthetic onChange.
    const reminderDate = reminderDateRef.current?.value || form.reminder_date;
    const rawTime = reminderTimeRef.current?.value || form.reminder_time;

    // Normalize time inline (onBlur may not have fired if user clicked Save directly).
    // Handles "1430", "14.30", "14:30 ", "9" → proper "HH:MM".
    const reminderTime = rawTime.trim() ? normalizeTime(rawTime) : '';

    // If a time is set but no date → default to today (common case: same-day reminder).
    const todayStr = new Date().toISOString().slice(0, 10);
    const effectiveDate = reminderDate || (reminderTime ? todayStr : '');

    // Allow date-only reminder: if a date is set but no time, default to 08:00.
    const effectiveTime = reminderTime || (effectiveDate ? '08:00' : '');
    const hasReminder = !!(effectiveDate && effectiveTime);
    const reminderIso = hasReminder ? buildReminderIso(effectiveDate, effectiveTime) : null;

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
        reminder_at: reminderIso,
        has_reminder: hasReminder ? 1 : 0,
        tags: form.tags || null,
        project_or_customer: form.project_or_customer || null,
        notes: form.notes || null,
        estimated_duration: form.estimated_duration ? Number(form.estimated_duration) : null,
        status_note: form.status_note || null,
        source_page_id: task?.source_page_id ?? prefill?.source_page_id ?? null,
        contact_id: form.contact_id ?? null,
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
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 200ms ease',
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
        />

        {/* Panel — schwebendes Modal */}
        <div
          data-modal
          style={modalPos ? {
            // Manuell verschoben — absolute Position
            position: 'fixed',
            left: modalPos.x,
            top: modalPos.y,
            transform: 'none',
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 200ms ease',
            width: 'min(560px, 92vw)',
            maxHeight: '90vh',
            borderRadius: '0.75rem',
            background: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            overflowY: 'auto',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          } : {
            // Zentriertes schwebendes Modal
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: isOpen ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
            opacity: isOpen ? 1 : 0,
            transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease',
            width: 'min(560px, 92vw)',
            maxHeight: '90vh',
            borderRadius: '0.75rem',
            background: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            overflowY: 'auto',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            onMouseDown={handleHeaderMouseDown}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--color-outline-variant)',
              flexShrink: 0,
              cursor: 'grab',
              userSelect: 'none',
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

            {/* Arbeitsmappe-Link — direkt unter dem Titel */}
            {(task?.source_page_id || prefill?.source_page_id) && (
              <div>
                <label style={LABEL_STYLE}>Ursprung</label>
                <button
                  onClick={() => {
                    const pageId = task?.source_page_id ?? prefill?.source_page_id;
                    navigate('/arbeitsmappe', { state: { openPageId: pageId } });
                    onClose();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--color-surface-container-low)',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem', cursor: 'pointer',
                    color: 'var(--color-primary)', fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem', textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', flexShrink: 0 }}>menu_book</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task?.source_page_title ?? prefill?.source_page_title ?? `Seite #${task?.source_page_id ?? prefill?.source_page_id}`}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', marginLeft: 'auto', flexShrink: 0, color: 'var(--color-on-surface-variant)' }}>open_in_new</span>
                </button>
              </div>
            )}

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
                <label style={LABEL_STYLE}>Priorität</label>
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

            {/* Start date + Due date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
              <div>
                <label style={LABEL_STYLE}>Fälligkeitsdatum</label>
                <input
                  className="task-input"
                  style={INPUT_STYLE}
                  type="date"
                  value={form.due_date}
                  onChange={(e) => {
                    const newDueDate = e.target.value;
                    handleChange('due_date', newDueDate);
                    // Erinnerung automatisch auf Fälligkeitsdatum setzen,
                    // wenn noch keine Erinnerung gesetzt ist
                    if (newDueDate && !form.reminder_date) {
                      handleChange('reminder_date', newDueDate);
                    }
                  }}
                />
              </div>
            </div>

            {/* Erinnerung */}
            <div>
              <label style={LABEL_STYLE}>Erinnerung am</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input
                  ref={reminderDateRef}
                  className="task-input"
                  style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
                  type="date"
                  value={form.reminder_date}
                  onChange={(e) => handleChange('reminder_date', e.target.value)}
                  onInput={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (val) handleChange('reminder_date', val);
                  }}
                  placeholder="Datum"
                />
                <input
                  ref={reminderTimeRef}
                  className="task-input"
                  style={INPUT_STYLE}
                  type="text"
                  inputMode="numeric"
                  value={form.reminder_time}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Nur Ziffern + Doppelpunkt erlauben
                    const digits = raw.replace(/[^\d]/g, '');
                    // Live-Formatierung: nach 2 Ziffern automatisch ":" einfügen
                    let formatted = digits;
                    if (digits.length >= 3) {
                      formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4);
                    }
                    handleChange('reminder_time', formatted);
                  }}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) return;
                    const digits = raw.replace(/\D/g, '');
                    let h = '', m = '';
                    if (digits.length <= 2) { h = digits; m = '00'; }
                    else if (digits.length === 3) { h = digits[0]; m = digits.slice(1); }
                    else { h = digits.slice(0, 2); m = digits.slice(2, 4); }
                    const hh = Math.min(23, parseInt(h || '0', 10));
                    const mm = Math.min(59, parseInt(m || '0', 10));
                    const normalized = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
                    handleChange('reminder_time', normalized);
                  }}
                  placeholder="z.B. 14:30"
                />
              </div>
              {(form.reminder_date || form.reminder_time) && (
                <button
                  type="button"
                  onClick={() => { handleChange('reminder_date', ''); handleChange('reminder_time', ''); }}
                  style={{ marginTop: '0.25rem', background: 'none', border: 'none', color: 'var(--color-outline)', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                >
                  × Erinnerung entfernen
                </button>
              )}
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

            {/* Kontakt-Verknüpfung */}
            <div style={{ position: 'relative' }}>
              <label style={LABEL_STYLE}>Kontakt</label>
              {form.contact_id ? (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'rgba(204,151,255,0.15)',
                    border: '1px solid rgba(204,151,255,0.3)',
                    borderRadius: '999px',
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.8rem',
                    color: 'var(--color-primary)',
                    fontFamily: 'var(--font-body)',
                  }}>
                    {form.contact_name || `Kontakt #${form.contact_id}`}
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, contact_id: null, contact_name: '' }))}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        marginLeft: '0.5rem',
                        color: 'var(--color-primary)',
                        padding: 0,
                        lineHeight: 1,
                        fontSize: '1rem',
                      }}
                    >×</button>
                  </span>
                </div>
              ) : (
                <input
                  className="task-input"
                  style={INPUT_STYLE}
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setContactDropdownOpen(false), 150)}
                  placeholder="Kontakt suchen..."
                />
              )}
              {contactDropdownOpen && contactResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 60,
                  background: 'var(--color-surface-container)',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  marginTop: '0.25rem',
                }}>
                  {contactResults.map(contact => {
                    const displayName = contact.contact_kind === 'person'
                      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.organization_name || '—'
                      : contact.organization_name || '—';
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onMouseDown={() => {
                          setForm(prev => ({ ...prev, contact_id: contact.id, contact_name: displayName }));
                          setContactSearch('');
                          setContactDropdownOpen(false);
                          setContactResults([]);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.5rem 0.75rem',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.875rem',
                          color: 'var(--color-on-surface)',
                          borderBottom: '1px solid var(--color-outline-variant)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span>{displayName}</span>
                        {contact.customer_number && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                            #{contact.customer_number}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

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

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {task && (
                <button
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await onSave({
                        title: form.title.trim() || task.title,
                        status: 'done',
                        description: form.description || null,
                        priority: form.priority,
                        area: form.area || null,
                        due_date: form.due_date || null,
                        start_date: form.start_date || null,
                        reminder_at: null,
                        has_reminder: 0,
                        tags: form.tags || null,
                        project_or_customer: form.project_or_customer || null,
                        notes: form.notes || null,
                        estimated_duration: null,
                        status_note: form.status_note || null,
                        source_page_id: task.source_page_id ?? null,
                        contact_id: form.contact_id ?? null,
                      });
                      onClose();
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '9999px',
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    color: '#22c55e',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>check_circle</span>
                  Erledigt
                </button>
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
      </div>
    </>
  );
}
