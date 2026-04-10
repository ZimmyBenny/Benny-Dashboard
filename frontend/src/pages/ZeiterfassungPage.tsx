import { useState, useEffect, useCallback } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { useTimerStore } from '../store/timerStore';
import {
  fetchClients, fetchProjects, fetchTimeEntries,
  createClient, createProject, createTimeEntry, updateTimeEntry, deleteTimeEntry,
  type Client, type Project, type TimeEntry,
} from '../api/zeiterfassung.api';

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
  client_id: number | null;
  title: string;
}

// ── Eintrag speichern / bearbeiten Panel ───────────────────────────────────────

interface SavePanelProps {
  durationMs: number;
  clients: Client[];
  projects: Project[];
  onSaved: () => void;
  onCancel: () => void;
  editEntry?: TimeEntry | null;
  onClientsChange: (clients: Client[]) => void;
  onProjectsChange: (projects: Project[]) => void;
  sessionStartedAt?: number | null;
  preset?: QuickStartPreset | null;
}

function EntryPanel({
  durationMs, clients, projects, onSaved, onCancel,
  editEntry, onClientsChange, onProjectsChange,
  sessionStartedAt, preset,
}: SavePanelProps) {
  // Prioritaet: editEntry > preset > leer
  const defaultProjectId = editEntry?.project_id ?? preset?.project_id ?? '';
  const defaultClientId = editEntry?.client_id ?? preset?.client_id ?? '';
  const defaultTitle = editEntry?.title ?? preset?.title ?? '';

  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState(editEntry?.note ?? '');
  const [date, setDate] = useState(editEntry?.date ?? todayISO());
  const [projectId, setProjectId] = useState<number | ''>(defaultProjectId !== null ? (defaultProjectId as number | '') : '');
  const [clientId, setClientId] = useState<number | ''>(defaultClientId !== null ? (defaultClientId as number | '') : '');
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const durationSeconds = editEntry
    ? editEntry.duration_seconds
    : Math.round(durationMs / 1000);

  async function handleAddClient() {
    if (!newClientName.trim()) return;
    try {
      const c = await createClient(newClientName.trim());
      onClientsChange([...clients, c]);
      setClientId(c.id);
      setNewClientName('');
      setAddingClient(false);
    } catch {
      setError('Kunde konnte nicht angelegt werden');
    }
  }

  async function handleAddProject() {
    if (!newProjectName.trim()) return;
    try {
      const p = await createProject({
        name: newProjectName.trim(),
        client_id: clientId !== '' ? clientId : null,
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
        client_id: clientId !== '' ? clientId : null,
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

        {/* Kunde */}
        <div>
          <label style={labelStyle}>Kunde</label>
          {addingClient ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Kundenname"
                onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
                autoFocus
              />
              <button onClick={handleAddClient} style={{
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'var(--color-primary)', color: '#000', border: 'none', fontWeight: 600, fontSize: '0.8rem',
              }}>OK</button>
              <button onClick={() => setAddingClient(false)} style={{
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: 'var(--color-on-surface)', border: 'none',
              }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                style={{ ...inputStyle, flex: 1 }}
                value={clientId}
                onChange={(e) => setClientId(e.target.value !== '' ? Number(e.target.value) : '')}
              >
                <option value="">— Kein Kunde —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => setAddingClient(true)} title="Neuer Kunde" style={{
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: 'var(--color-primary)', border: '1px solid var(--color-outline-variant)',
                fontSize: '1rem', lineHeight: 1,
              }}>+</button>
            </div>
          )}
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
                background: 'var(--color-primary)', color: '#000', border: 'none', fontWeight: 600, fontSize: '0.8rem',
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
  clients: Client[];
  projects: Project[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: number) => void;
  onQuickStart: (entry: TimeEntry) => void;
  filterProject: number | '';
  filterClient: number | '';
  setFilterProject: (v: number | '') => void;
  setFilterClient: (v: number | '') => void;
}

function EntryList({
  entries, clients, projects, onEdit, onDelete, onQuickStart,
  filterProject, filterClient, setFilterProject, setFilterClient,
}: EntryListProps) {
  const filtered = entries.filter((e) => {
    if (filterProject !== '' && e.project_id !== filterProject) return false;
    if (filterClient !== '' && e.client_id !== filterClient) return false;
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
        <select
          style={{ ...inputStyle, width: 'auto', minWidth: '160px' }}
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value !== '' ? Number(e.target.value) : '')}
        >
          <option value="">Alle Kunden</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(filterProject !== '' || filterClient !== '') && (
          <button
            onClick={() => { setFilterProject(''); setFilterClient(''); }}
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
                  {[entry.project_name, entry.client_name].filter(Boolean).join(' · ') || '—'}
                </p>
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

  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [filterProject, setFilterProject] = useState<number | ''>('');
  const [filterClient, setFilterClient] = useState<number | ''>('');

  // Daten laden
  const loadAll = useCallback(async () => {
    const [c, p, e] = await Promise.all([fetchClients(), fetchProjects(), fetchTimeEntries()]);
    setClients(c);
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
      client_id: entry.client_id,
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
            clients={clients}
            projects={projects}
            onSaved={handleSaved}
            onCancel={handleCancelSave}
            editEntry={editEntry}
            onClientsChange={setClients}
            onProjectsChange={setProjects}
            sessionStartedAt={sessionStart}
            preset={quickStartPreset}
          />
        </div>
      )}

      {/* ── Export-Panel ─────────────────────────────────────── */}
      {/* Wird in Task 4 eingefuegt */}

      {/* ── Zeiteinträge ─────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
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
        </div>

        <EntryList
          entries={entries}
          clients={clients}
          projects={projects}
          onEdit={(entry) => handleEdit(entry)}
          onDelete={handleDelete}
          onQuickStart={handleQuickStart}
          filterProject={filterProject}
          filterClient={filterClient}
          setFilterProject={setFilterProject}
          setFilterClient={setFilterClient}
        />
      </div>
    </PageWrapper>
  );
}
