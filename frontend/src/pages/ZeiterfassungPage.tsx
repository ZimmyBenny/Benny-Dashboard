import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { useTimerStore } from '../store/timerStore';
import {
  fetchProjects, fetchTimeEntries,
  createProject, createTimeEntry, updateTimeEntry, deleteTimeEntry,
  type Project, type TimeEntry,
} from '../api/zeiterfassung.api';
import { fetchContacts, type Contact } from '../api/contacts.api';
import { exportCsv, type ExportRow } from '../lib/exportCsv';
import { exportPdf } from '../lib/exportPdf';

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Input-Stil ─────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.875rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--color-outline-variant)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: '0.7rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-outline)',
  marginBottom: '0.375rem',
};

// ── Preset fuer Schnellstart ───────────────────────────────────────────────────

interface QuickStartPreset {
  project_id: number | null;
  title: string;
}

// ── Eintrag speichern / bearbeiten Panel ───────────────────────────────────────

interface SavePanelProps {
  durationMs: number;
  projects: Project[];
  onSaved: () => void;
  onCancel: () => void;
  editEntry?: TimeEntry | null;
  onProjectsChange: (projects: Project[]) => void;
  sessionStartedAt?: number | null;
  preset?: QuickStartPreset | null;
}

function EntryPanel({
  durationMs, projects, onSaved, onCancel,
  editEntry, onProjectsChange,
  sessionStartedAt, preset,
}: SavePanelProps) {
  // Prioritaet: editEntry > preset > leer
  const defaultProjectId = editEntry?.project_id ?? preset?.project_id ?? '';
  const defaultTitle = editEntry?.title ?? preset?.title ?? '';

  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState(editEntry?.note ?? '');
  const [date, setDate] = useState(editEntry?.date ?? todayISO());
  const [projectId, setProjectId] = useState<number | ''>(defaultProjectId !== null ? (defaultProjectId as number | '') : '');
  const [newProjectName, setNewProjectName] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Kontakt-Picker
  const [contactId, setContactId] = useState<number | null>(editEntry?.contact_id ?? null);
  const [contactName, setContactName] = useState(editEntry?.contact_name ?? '');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);

  useEffect(() => {
    if (contactSearch.length < 2) { setContactResults([]); setContactDropdownOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const result = await fetchContacts({ search: contactSearch, limit: 8 });
        setContactResults(result.data);
        setContactDropdownOpen(true);
      } catch { setContactResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch]);

  const durationSeconds = editEntry
    ? editEntry.duration_seconds
    : Math.round(durationMs / 1000);

  async function handleAddProject() {
    if (!newProjectName.trim()) return;
    try {
      const p = await createProject({
        name: newProjectName.trim(),
        client_id: null,
      });
      onProjectsChange([...projects, p]);
      setProjectId(p.id);
      setNewProjectName('');
      setAddingProject(false);
    } catch {
      setError('Projekt konnte nicht angelegt werden');
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError('Titel ist erforderlich'); return; }
    setSaving(true);
    setError('');
    try {
      // start_time / end_time berechnen wenn Timer-Session vorhanden (nicht bei editEntry)
      let start_time: string | null = null;
      let end_time: string | null = null;
      if (!editEntry && sessionStartedAt != null) {
        start_time = new Date(sessionStartedAt).toISOString();
        end_time = new Date(sessionStartedAt + durationSeconds * 1000).toISOString();
      }

      const payload = {
        project_id: projectId !== '' ? projectId : null,
        contact_id: contactId,
        title: title.trim(),
        note: note.trim() || null,
        date,
        duration_seconds: durationSeconds,
        start_time,
        end_time,
      };
      if (editEntry) {
        await updateTimeEntry(editEntry.id, payload);
      } else {
        await createTimeEntry(payload);
      }
      onSaved();
    } catch {
      setError('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      background: 'rgba(25,37,64,0.6)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderTop: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '1rem',
      padding: '1.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 700,
          fontSize: '1rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface)',
        }}>
          {editEntry ? 'Eintrag bearbeiten' : 'Eintrag speichern'}
        </h2>
        <div style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 800,
          fontSize: '1.25rem',
          letterSpacing: '-0.02em',
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          {formatDuration(durationSeconds)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Titel */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Titel / Aufgabe *</label>
          <input
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Was hast du gemacht?"
          />
        </div>

        {/* Projekt */}
        <div>
          <label style={labelStyle}>Projekt</label>
          {addingProject ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Projektname"
                onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
                autoFocus
              />
              <button onClick={handleAddProject} style={{
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)', color: '#000', border: 'none', fontWeight: 600, fontSize: '0.8rem',
              }}>OK</button>
              <button onClick={() => setAddingProject(false)} style={{
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: 'var(--color-on-surface)', border: 'none',
              }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                style={{ ...inputStyle, flex: 1 }}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value !== '' ? Number(e.target.value) : '')}
              >
                <option value="">— Kein Projekt —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => setAddingProject(true)} title="Neues Projekt" style={{
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: 'var(--color-primary)', border: '1px solid var(--color-outline-variant)',
                fontSize: '1rem', lineHeight: 1,
              }}>+</button>
            </div>
          )}
        </div>

        {/* Kontakt */}
        <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
          <label style={labelStyle}>Kontakt</label>
          {contactId ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              background: 'rgba(204,151,255,0.15)', border: '1px solid rgba(204,151,255,0.3)',
              borderRadius: '999px', padding: '0.3rem 0.75rem',
            }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                {contactName}
              </span>
              <button
                type="button"
                onClick={() => { setContactId(null); setContactName(''); setContactSearch(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)',
                  display: 'flex', alignItems: 'center', padding: 0, fontSize: '1rem', lineHeight: 1 }}
              >×</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                style={inputStyle}
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                onFocus={() => contactSearch.length >= 2 && contactResults.length > 0 && setContactDropdownOpen(true)}
                onBlur={() => setTimeout(() => setContactDropdownOpen(false), 150)}
                placeholder="Kontakt suchen…"
              />
              {contactDropdownOpen && contactResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'rgba(18,28,50,0.98)', border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem', marginTop: '0.25rem',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden',
                }}>
                  {contactResults.map(ct => {
                    const display = ct.contact_kind === 'person'
                      ? [ct.first_name, ct.last_name].filter(Boolean).join(' ') || ct.organization_name || '—'
                      : ct.organization_name || '—';
                    return (
                      <div
                        key={ct.id}
                        onMouseDown={() => {
                          setContactId(ct.id);
                          setContactName(display);
                          setContactSearch('');
                          setContactDropdownOpen(false);
                        }}
                        style={{
                          padding: '0.625rem 0.875rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: '0.5rem',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,151,255,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                          {display}
                        </span>
                        {ct.customer_number && (
                          <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>
                            #{ct.customer_number}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Datum */}
        <div>
          <label style={labelStyle}>Datum</label>
          <input
            type="date"
            style={inputStyle}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Dauer */}
        <div>
          <label style={labelStyle}>Dauer</label>
          <div style={{
            ...inputStyle,
            background: 'rgba(255,255,255,0.02)',
            color: 'var(--color-on-surface-variant)',
            cursor: 'default',
          }}>
            {formatDuration(durationSeconds)}
          </div>
        </div>

        {/* Notiz */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Notiz</label>
          <textarea
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optionale Beschreibung..."
          />
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.75rem' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
          padding: '0.625rem 1.25rem', borderRadius: '0.5rem', cursor: 'pointer',
          background: 'transparent', color: 'var(--color-on-surface-variant)',
          border: '1px solid var(--color-outline-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
        }}>
          Abbrechen
        </button>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '0.625rem 1.5rem', borderRadius: '0.5rem', cursor: saving ? 'not-allowed' : 'pointer',
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
          color: '#000', border: 'none', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600,
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

// ── Eintragsliste ──────────────────────────────────────────────────────────────

interface EntryListProps {
  entries: TimeEntry[];
  projects: Project[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: number) => void;
  onQuickStart: (entry: TimeEntry) => void;
  filterProject: number | '';
  filterContact: number | '';
  setFilterProject: (v: number | '') => void;
  setFilterContact: (v: number | '') => void;
}

function EntryList({
  entries, projects, onEdit, onDelete, onQuickStart,
  filterProject, filterContact, setFilterProject, setFilterContact,
}: EntryListProps) {
  // Unique Kontakte aus Einträgen für das Filter-Dropdown
  const contactOptions = Array.from(
    new Map(
      entries
        .filter((e) => e.contact_id != null && e.contact_name)
        .map((e) => [e.contact_id, { id: e.contact_id as number, name: e.contact_name as string }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filtered = entries.filter((e) => {
    if (filterProject !== '' && e.project_id !== filterProject) return false;
    if (filterContact !== '' && e.contact_id !== filterContact) return false;
    return true;
  });

  return (
    <div>
      {/* Filter-Leiste */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          style={{ ...inputStyle, width: 'auto', minWidth: '160px' }}
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value !== '' ? Number(e.target.value) : '')}
        >
          <option value="">Alle Projekte</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {contactOptions.length > 0 && (
          <select
            style={{ ...inputStyle, width: 'auto', minWidth: '160px' }}
            value={filterContact}
            onChange={(e) => setFilterContact(e.target.value !== '' ? Number(e.target.value) : '')}
          >
            <option value="">Alle Kontakte</option>
            {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {(filterProject !== '' || filterContact !== '') && (
          <button
            onClick={() => { setFilterProject(''); setFilterContact(''); }}
            style={{
              padding: '0.625rem 0.875rem', borderRadius: '0.5rem', cursor: 'pointer',
              background: 'transparent', color: 'var(--color-outline)',
              border: '1px solid var(--color-outline-variant)', fontSize: '0.8rem',
              fontFamily: 'var(--font-body)',
            }}
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--color-outline)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '0.75rem',
          border: '1px dashed var(--color-outline-variant)',
        }}>
          Noch keine Einträge vorhanden
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.875rem 1rem',
                background: 'rgba(25,37,64,0.4)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.75rem',
                transition: 'border-color 200ms ease',
              }}
            >
              {/* Datum */}
              <div style={{
                flexShrink: 0, width: '80px',
                fontFamily: 'var(--font-body)', fontSize: '0.75rem',
                color: 'var(--color-outline)', letterSpacing: '0.04em',
              }}>
                {new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem',
                  color: 'var(--color-on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {entry.title}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.75rem',
                  color: 'var(--color-on-surface-variant)', marginTop: '0.125rem',
                }}>
                  {[entry.project_name, entry.contact_name].filter(Boolean).join(' · ') || '—'}
                </p>
                {(entry.start_time || entry.end_time) && (
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                    color: 'var(--color-outline)', marginTop: '0.125rem',
                    letterSpacing: '0.02em',
                  }}>
                    {entry.start_time
                      ? new Date(entry.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                      : '?'}
                    {' → '}
                    {entry.end_time
                      ? new Date(entry.end_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                      : '?'}
                  </p>
                )}
              </div>

              {/* Dauer */}
              <div style={{
                flexShrink: 0,
                fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.9rem',
                color: 'var(--color-primary)',
              }}>
                {formatDuration(entry.duration_seconds)}
              </div>

              {/* Aktionen */}
              <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                {/* Schnellstart-Button */}
                <button
                  onClick={() => onQuickStart(entry)}
                  title="Timer mit diesem Eintrag starten"
                  style={{
                    padding: '0.375rem 0.625rem', borderRadius: '0.4rem', cursor: 'pointer',
                    background: 'rgba(52,181,250,0.08)', color: 'var(--color-secondary)',
                    border: 'none', fontSize: '0.8rem',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', display: 'block' }}>play_arrow</span>
                </button>
                <button onClick={() => onEdit(entry)} style={{
                  padding: '0.375rem 0.625rem', borderRadius: '0.4rem', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)', color: 'var(--color-on-surface-variant)',
                  border: 'none', fontSize: '0.8rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', display: 'block' }}>edit</span>
                </button>
                <button onClick={() => onDelete(entry.id)} style={{
                  padding: '0.375rem 0.625rem', borderRadius: '0.4rem', cursor: 'pointer',
                  background: 'rgba(255,110,132,0.08)', color: 'var(--color-error)',
                  border: 'none', fontSize: '0.8rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', display: 'block' }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────

export function ZeiterfassungPage() {
  const { status, start, pause, resume, stop, getElapsedMs } = useTimerStore();
  const [displayMs, setDisplayMs] = useState(() => getElapsedMs());
  const [stoppedMs, setStoppedMs] = useState<number | null>(null);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [quickStartPreset, setQuickStartPreset] = useState<QuickStartPreset | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showEntries, setShowEntries] = useState(true);
  const [filterProject, setFilterProject] = useState<number | ''>('');
  const [filterContact, setFilterContact] = useState<number | ''>('');

  // Export-State
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportProject, setExportProject] = useState<number | ''>('');

  // Daten laden
  const loadAll = useCallback(async () => {
    const [p, e] = await Promise.all([fetchProjects(), fetchTimeEntries()]);
    setProjects(p);
    setEntries(e);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Timer-Tick
  useEffect(() => {
    if (status !== 'running') {
      setDisplayMs(getElapsedMs());
      return;
    }
    const id = setInterval(() => setDisplayMs(getElapsedMs()), 100);
    return () => clearInterval(id);
  }, [status, getElapsedMs]);

  function handleStart() {
    start();
    setStoppedMs(null);
    setShowPanel(false);
    setQuickStartPreset(null);
  }

  function handleStop() {
    const { totalMs, sessionStartedAt } = stop();
    setStoppedMs(totalMs);
    setSessionStart(sessionStartedAt);
    setShowPanel(true);
    setEditEntry(null);
  }

  function handleQuickStart(entry: TimeEntry) {
    start();
    setStoppedMs(null);
    setShowPanel(false);
    setEditEntry(null);
    setQuickStartPreset({
      project_id: entry.project_id,
      title: entry.title,
    });
  }

  function handleSaved() {
    setShowPanel(false);
    setStoppedMs(null);
    setSessionStart(null);
    setEditEntry(null);
    setQuickStartPreset(null);
    loadAll();
  }

  function handleCancelSave() {
    setShowPanel(false);
    setStoppedMs(null);
    setSessionStart(null);
    setEditEntry(null);
  }

  async function handleDelete(id: number) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await deleteTimeEntry(id);
    loadAll();
  }

  function handleEdit(entry: TimeEntry) {
    setEditEntry(entry);
    setShowPanel(true);
    setStoppedMs(null);
    setSessionStart(null);
  }

  // Export-Hilfsfunktionen
  const exportEntries = useMemo((): ExportRow[] => {
    return entries
      .filter((e) => {
        if (exportDateFrom && e.date < exportDateFrom) return false;
        if (exportDateTo && e.date > exportDateTo) return false;
        if (exportProject !== '' && e.project_id !== exportProject) return false;
        return true;
      })
      .map((e) => ({
        date: e.date,
        start_time: e.start_time,
        end_time: e.end_time,
        duration_seconds: e.duration_seconds,
        project_name: e.project_name ?? null,
        client_name: null,
        title: e.title,
        note: e.note,
      }));
  }, [entries, exportDateFrom, exportDateTo, exportProject]);

  const exportTotalSeconds = useMemo(
    () => exportEntries.reduce((s, e) => s + e.duration_seconds, 0),
    [exportEntries],
  );

  function exportFilename() {
    const from = exportDateFrom || 'alle';
    const to = exportDateTo || 'alle';
    return `zeiterfassung-${from}-${to}`;
  }

  function exportFilterLabel() {
    const parts: string[] = [];
    if (exportProject !== '') {
      const p = projects.find((x) => x.id === exportProject);
      if (p) parts.push(`Projekt: ${p.name}`);
    }
    if (exportDateFrom || exportDateTo) {
      const f = exportDateFrom
        ? new Date(exportDateFrom).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      const t = exportDateTo
        ? new Date(exportDateTo).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      parts.push(f && t ? `${f} – ${t}` : f || t);
    }
    return parts.join(' | ');
  }

  function formatExportTotal(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isActive = isRunning || isPaused;

  return (
    <PageWrapper>
      {/* ── Timer-Karte ─────────────────────────────────────── */}
      <div style={{
        background: 'rgba(25,37,64,0.5)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTop: isRunning
          ? '1px solid rgba(52,181,250,0.4)'
          : isPaused
            ? '1px solid rgba(204,151,255,0.4)'
            : '1px solid rgba(255,255,255,0.12)',
        borderRadius: '1.25rem',
        padding: '2.5rem',
        marginBottom: '2rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 300ms ease',
      }}>
        {/* Ambient glow je nach Status */}
        {isRunning && (
          <div aria-hidden style={{
            position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
            width: '400px', height: '200px',
            background: 'radial-gradient(ellipse, rgba(52,181,250,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
        )}
        {isPaused && (
          <div aria-hidden style={{
            position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
            width: '400px', height: '200px',
            background: 'radial-gradient(ellipse, rgba(204,151,255,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Status-Badge */}
        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            background: isRunning
              ? 'rgba(52,181,250,0.12)'
              : isPaused
                ? 'rgba(204,151,255,0.12)'
                : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isRunning ? 'rgba(52,181,250,0.3)' : isPaused ? 'rgba(204,151,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
            fontFamily: 'var(--font-body)',
            fontSize: '0.7rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: isRunning
              ? 'var(--color-secondary)'
              : isPaused
                ? 'var(--color-primary)'
                : 'var(--color-outline)',
          }}>
            {isRunning && (
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'var(--color-secondary)',
                boxShadow: '0 0 8px rgba(52,181,250,0.8)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            )}
            {isRunning ? 'Läuft' : isPaused ? 'Pausiert' : 'Bereit'}
          </span>
        </div>

        {/* Schnellstart-Preset Anzeige */}
        {isActive && quickStartPreset && (
          <div style={{
            marginBottom: '0.75rem',
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.25rem 0.875rem',
            borderRadius: '9999px',
            background: 'rgba(52,181,250,0.08)',
            border: '1px solid rgba(52,181,250,0.2)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            color: 'var(--color-secondary)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>bolt</span>
            {quickStartPreset.title}
          </div>
        )}

        {/* Timer-Display */}
        <div style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 900,
          fontSize: 'clamp(3rem, 8vw, 7rem)',
          letterSpacing: '-0.04em',
          lineHeight: 1,
          marginBottom: '2rem',
          ...(isRunning ? {
            background: 'linear-gradient(90deg, var(--color-secondary) 0%, var(--color-primary) 60%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          } : isPaused ? {
            background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 60%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          } : {
            color: 'rgba(255,255,255,0.2)',
          }),
        }}>
          {formatMs(displayMs)}
        </div>

        {/* Steuerknöpfe */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {!isActive && (
            <button onClick={handleStart} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 2rem',
              borderRadius: '9999px',
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
              color: '#000', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.9rem',
              letterSpacing: '0.04em',
              boxShadow: '0 0 24px rgba(204,151,255,0.2)',
              transition: 'box-shadow 200ms ease',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>play_arrow</span>
              Starten
            </button>
          )}

          {/* Letzten duplizieren Button */}
          {!isActive && entries.length > 0 && (
            <button
              onClick={() => handleQuickStart(entries[0])}
              title={`Letzten Eintrag duplizieren: ${entries[0].title}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                borderRadius: '9999px',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--color-on-surface-variant)',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>content_copy</span>
              Letzten duplizieren
            </button>
          )}

          {isRunning && (
            <button onClick={pause} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px',
              background: 'rgba(204,151,255,0.12)',
              color: 'var(--color-primary)',
              border: '1px solid rgba(204,151,255,0.3)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9rem',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>pause</span>
              Pause
            </button>
          )}

          {isPaused && (
            <button onClick={resume} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px',
              background: 'rgba(52,181,250,0.12)',
              color: 'var(--color-secondary)',
              border: '1px solid rgba(52,181,250,0.3)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9rem',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>play_arrow</span>
              Weiter
            </button>
          )}

          {isActive && (
            <button onClick={handleStop} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px',
              background: 'rgba(255,110,132,0.1)',
              color: 'var(--color-error)',
              border: '1px solid rgba(255,110,132,0.25)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9rem',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>stop</span>
              Stopp
            </button>
          )}
        </div>
      </div>

      {/* ── Speichern / Bearbeiten Panel ─────────────────────── */}
      {showPanel && (
        <div style={{ marginBottom: '2rem' }}>
          <EntryPanel
            durationMs={stoppedMs ?? 0}
            projects={projects}
            onSaved={handleSaved}
            onCancel={handleCancelSave}
            editEntry={editEntry}
            onProjectsChange={setProjects}
            sessionStartedAt={sessionStart}
            preset={quickStartPreset}
          />
        </div>
      )}

      {/* ── Zeiteinträge (collapsible) ───────────────────────── */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => setShowEntries((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '1rem', width: '100%',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            marginBottom: showEntries ? '1.25rem' : 0,
          }}
        >
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '0.65rem',
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'var(--color-outline)', whiteSpace: 'nowrap',
          }}>
            Einträge
          </p>
          <div style={{
            flex: 1, height: '1px',
            background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)',
          }} />
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '0.75rem',
            color: 'var(--color-outline)',
          }}>
            {entries.length} gesamt
          </span>
          <span className="material-symbols-outlined" style={{
            fontSize: '16px',
            color: 'var(--color-outline)',
            transition: 'transform 200ms ease',
            transform: showEntries ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}>
            expand_more
          </span>
        </button>

        {showEntries && (
          <EntryList
            entries={entries}
            projects={projects}
            onEdit={(entry) => handleEdit(entry)}
            onDelete={handleDelete}
            onQuickStart={handleQuickStart}
            filterProject={filterProject}
            filterContact={filterContact}
            setFilterProject={setFilterProject}
            setFilterContact={setFilterContact}
          />
        )}
      </div>

      {/* ── Export-Panel ─────────────────────────────────────── */}
      <div style={{
        background: 'rgba(25,37,64,0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTop: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '1rem',
        padding: '1.5rem 1.75rem',
        marginBottom: '2rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-headline)',
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-on-surface)',
          }}>
            Export
          </h2>
          {exportEntries.length > 0 && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              color: 'var(--color-outline)',
            }}>
              {exportEntries.length} {exportEntries.length === 1 ? 'Eintrag' : 'Einträge'} · {formatExportTotal(exportTotalSeconds)}
            </span>
          )}
        </div>

        {/* Filter-Zeile */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '140px' }}>
            <label style={labelStyle}>Von</label>
            <input
              type="date"
              style={inputStyle}
              value={exportDateFrom}
              onChange={(e) => setExportDateFrom(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '140px' }}>
            <label style={labelStyle}>Bis</label>
            <input
              type="date"
              style={inputStyle}
              value={exportDateTo}
              onChange={(e) => setExportDateTo(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '160px', flex: 1 }}>
            <label style={labelStyle}>Projekt</label>
            <select
              style={inputStyle}
              value={exportProject}
              onChange={(e) => setExportProject(e.target.value !== '' ? Number(e.target.value) : '')}
            >
              <option value="">Alle Projekte</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {(exportDateFrom || exportDateTo || exportProject !== '') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', justifyContent: 'flex-end' }}>
              <label style={{ ...labelStyle, visibility: 'hidden' }}>Reset</label>
              <button
                onClick={() => { setExportDateFrom(''); setExportDateTo(''); setExportProject(''); }}
                style={{
                  padding: '0.625rem 0.875rem', borderRadius: '0.5rem', cursor: 'pointer',
                  background: 'transparent', color: 'var(--color-outline)',
                  border: '1px solid var(--color-outline-variant)',
                  fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                }}
              >
                Zurücksetzen
              </button>
            </div>
          )}
        </div>

        {/* Export-Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => exportCsv({ entries: exportEntries, filename: exportFilename() })}
            disabled={exportEntries.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              background: exportEntries.length === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(204,151,255,0.08)',
              color: exportEntries.length === 0 ? 'var(--color-outline)' : 'var(--color-primary)',
              border: `1px solid ${exportEntries.length === 0 ? 'var(--color-outline-variant)' : 'rgba(204,151,255,0.25)'}`,
              cursor: exportEntries.length === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem',
              transition: 'background 200ms ease, border-color 200ms ease',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
            CSV exportieren
          </button>
          <button
            onClick={() => exportPdf({ entries: exportEntries, filterLabel: exportFilterLabel(), filename: exportFilename() })}
            disabled={exportEntries.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              background: exportEntries.length === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(52,181,250,0.08)',
              color: exportEntries.length === 0 ? 'var(--color-outline)' : 'var(--color-secondary)',
              border: `1px solid ${exportEntries.length === 0 ? 'var(--color-outline-variant)' : 'rgba(52,181,250,0.25)'}`,
              cursor: exportEntries.length === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem',
              transition: 'background 200ms ease, border-color 200ms ease',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>picture_as_pdf</span>
            PDF exportieren
          </button>
        </div>
      </div>

    </PageWrapper>
  );
}
