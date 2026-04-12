import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchContact,
  fetchContactTasks,
  fetchContactTimeEntries,
  deleteContact,
  archiveContact,
  addNote,
  updateNote,
  deleteNote,
  exportContactPdf,
  triggerDownload,
  type ContactDetail,
  type ContactNote,
} from '../api/contacts.api';
import { createTask, updateTask, deleteTask, type Task } from '../api/tasks.api';
import type { TimeEntry } from '../api/zeiterfassung.api';
import { TaskSlideOver } from '../components/tasks/TaskSlideOver';
import { fetchPagesByContact, type Page as WorkbookPage } from '../api/workbook.api';

// ---------------------------------------------------------------------------
// Farben fuer Bereich-Badges
// ---------------------------------------------------------------------------
const AREA_COLORS: Record<string, string> = {
  DJ: '#cc97ff',
  Amazon: '#ff9900',
  Cashback: '#4ade80',
  Finanzen: '#60a5fa',
  Privat: '#f472b6',
  Sonstiges: 'rgba(255,255,255,0.2)',
};

function Badge({ label, color, textDark = false }: { label: string; color: string; textDark?: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.6rem',
      borderRadius: '999px',
      fontSize: '0.72rem',
      fontFamily: 'var(--font-body)',
      letterSpacing: '0.06em',
      fontWeight: 600,
      background: color,
      color: textDark ? '#000' : 'var(--color-on-surface)',
    }}>
      {label}
    </span>
  );
}

const EVENT_ICONS: Record<string, string> = {
  created: 'add_circle',
  updated: 'edit',
  note_added: 'note_add',
  archived: 'archive',
  restored: 'unarchive',
  task_linked: 'link',
  task_completed: 'check_circle',
  task_reopened: 'restart_alt',
  task_unlinked: 'link_off',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Dauer-Formatierung
// ---------------------------------------------------------------------------
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// ContactDetailPage
// ---------------------------------------------------------------------------
export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'workbook' | 'time' | 'activity'>('overview');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Aufgaben-Tab
  const [contactTasks, setContactTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSlideOpen, setTaskSlideOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Zeiterfassungs-Tab
  const [contactTimeEntries, setContactTimeEntries] = useState<TimeEntry[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [timeExpanded, setTimeExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(`contact_detail_time_expanded_${id}`) !== 'false'; }
    catch { return true; }
  });

  // Arbeitsmappe-Tab
  const [workbookPages, setWorkbookPages] = useState<(WorkbookPage & { section_name?: string })[]>([]);
  const [workbookLoading, setWorkbookLoading] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const c = await fetchContact(Number(id));
      setContact(c);
    } catch (err) {
      console.error('Kontakt laden fehlgeschlagen', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function loadTasks() {
    if (!id) return;
    setTasksLoading(true);
    try {
      const tasks = await fetchContactTasks(Number(id));
      setContactTasks(tasks);
    } catch (err) {
      console.error('Aufgaben laden fehlgeschlagen', err);
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTimeEntries() {
    if (!id) return;
    setTimeEntriesLoading(true);
    try {
      const entries = await fetchContactTimeEntries(Number(id));
      setContactTimeEntries(entries);
    } catch (err) {
      console.error('Zeiteintraege laden fehlgeschlagen', err);
    } finally {
      setTimeEntriesLoading(false);
    }
  }

  useEffect(() => {
    void loadTimeEntries();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'workbook' || !id) return;
    setWorkbookLoading(true);
    fetchPagesByContact(Number(id))
      .then(setWorkbookPages)
      .catch(() => setWorkbookPages([]))
      .finally(() => setWorkbookLoading(false));
  }, [activeTab, id]);

  async function handleDelete() {
    if (!contact) return;
    const name = contact.contact_kind === 'organization'
      ? contact.organization_name
      : `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
    if (!window.confirm(`Kontakt "${name}" wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`)) return;
    await deleteContact(contact.id);
    navigate('/contacts');
  }

  async function handleArchive() {
    if (!contact) return;
    await archiveContact(contact.id, contact.is_archived === 0);
    void load();
  }

  async function handlePdfExport() {
    if (!contact) return;
    setPdfLoading(true);
    try {
      const blob = await exportContactPdf(contact.id);
      const name = contact.contact_kind === 'organization'
        ? (contact.organization_name ?? 'organisation')
        : `${contact.first_name ?? ''}_${contact.last_name ?? ''}`.trim();
      triggerDownload(blob, `kontakt-${contact.customer_number ?? contact.id}-${name}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleAddNote() {
    if (!contact || !newNoteContent.trim()) return;
    setSavingNote(true);
    try {
      await addNote(contact.id, newNoteContent.trim());
      setNewNoteContent('');
      void load();
    } finally {
      setSavingNote(false);
    }
  }

  async function handleUpdateNote(noteId: number) {
    if (!contact || !editingNoteContent.trim()) return;
    await updateNote(contact.id, noteId, editingNoteContent.trim());
    setEditingNoteId(null);
    void load();
  }

  async function handleDeleteNote(note: ContactNote) {
    if (!contact) return;
    if (!window.confirm('Notiz wirklich loeschen?')) return;
    await deleteNote(contact.id, note.id);
    void load();
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.5rem',
    padding: '1rem 1.25rem',
    marginBottom: '0.875rem',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.7rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--color-outline)',
    marginBottom: '0.2rem',
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    color: 'var(--color-on-surface)',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.5rem',
    color: 'var(--color-on-surface)',
    padding: '0.45rem 0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.8rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
  };

  const btnDanger: React.CSSProperties = {
    ...btnSecondary,
    color: '#f87171',
    borderColor: 'rgba(248,113,113,0.3)',
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.5rem',
    color: 'var(--color-on-surface)',
    padding: '0.625rem 0.875rem',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
  };

  if (loading) {
    return (
      <PageWrapper>
        <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', padding: '3rem 0', textAlign: 'center' }}>
          Lade...
        </div>
      </PageWrapper>
    );
  }

  if (!contact) {
    return (
      <PageWrapper>
        <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', padding: '3rem 0', textAlign: 'center' }}>
          Kontakt nicht gefunden.{' '}
          <Link to="/contacts" style={{ color: 'var(--color-primary)' }}>Zur Liste</Link>
        </div>
      </PageWrapper>
    );
  }

  const isPerson = contact.contact_kind === 'person';
  const name = isPerson
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.organization_name || '—'
    : contact.organization_name || '—';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const areaColor = AREA_COLORS[contact.area] ?? AREA_COLORS['Sonstiges'];

  // IBAN maskieren
  const maskedIban = contact.iban
    ? contact.iban.slice(0, 4) + ' **** **** **** ' + contact.iban.slice(-4)
    : null;

  return (
    <PageWrapper>
      {/* Zurueck-Navigation */}
      <Link
        to="/contacts"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          textDecoration: 'none',
          marginBottom: '1.25rem',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_back</span>
        Zurück zur Liste
      </Link>

      {/* Kopfbereich */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1.25rem',
        marginBottom: '1.75rem',
        flexWrap: 'wrap',
      }}>
        {/* Avatar */}
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#000',
          fontFamily: 'var(--font-headline)',
          fontWeight: 800,
          fontSize: '1.1rem',
          flexShrink: 0,
        }}>
          {initials}
        </div>

        {/* Name + Infos */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
            <h1 style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: 'clamp(1.3rem, 3vw, 1.75rem)',
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
              margin: 0,
            }}>
              {name}
            </h1>
            {contact.is_archived === 1 && (
              <Badge label="Archiviert" color="rgba(255,255,255,0.15)" />
            )}
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
            <Badge label={isPerson ? 'Person' : 'Organisation'} color="rgba(255,255,255,0.1)" />
            <Badge label={contact.type} color="rgba(255,255,255,0.1)" />
            <Badge label={contact.area} color={areaColor} textDark={areaColor !== 'rgba(255,255,255,0.2)'} />
          </div>

          {/* Kundennummer + Entfernung */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {contact.customer_number && (
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                #{contact.customer_number}
              </span>
            )}
            {contact.distance_km != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>location_on</span>
                ~{contact.distance_km} km
              </span>
            )}
          </div>

          {/* Primaere Kontaktdaten */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
            {contact.emails[0] && (
              <a href={`mailto:${contact.emails[0].email}`} style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', textDecoration: 'none' }}>
                {contact.emails[0].email}
              </a>
            )}
            {contact.phones[0] && (
              <a href={`tel:${contact.phones[0].phone}`} style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', textDecoration: 'none' }}>
                {contact.phones[0].phone}
              </a>
            )}
          </div>
        </div>

        {/* Aktionsbuttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
          <button style={btnSecondary} onClick={() => navigate(`/contacts/${contact.id}/edit`)}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>edit</span>
            Bearbeiten
          </button>
          <button style={btnSecondary} onClick={handlePdfExport} disabled={pdfLoading}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>picture_as_pdf</span>
            {pdfLoading ? 'PDF...' : 'PDF'}
          </button>
          <button style={btnSecondary} onClick={handleArchive}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              {contact.is_archived ? 'unarchive' : 'archive'}
            </span>
            {contact.is_archived ? 'Wiederherstellen' : 'Archivieren'}
          </button>
          <button style={btnDanger} onClick={handleDelete}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
            Löschen
          </button>
        </div>
      </div>

      {/* Tab-Bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
        {[
          { id: 'overview' as const, label: 'Übersicht', icon: 'info' },
          { id: 'notes' as const, label: 'Notizen', icon: 'note' },
          { id: 'workbook' as const, label: 'Arbeitsmappe', icon: 'menu_book' },
          { id: 'time' as const, label: 'Zeiterfassung', icon: 'timer' },
          { id: 'activity' as const, label: 'Verlauf', icon: 'history' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.5rem 1rem',
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)', fontSize: '0.875rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              letterSpacing: '0.02em',
              marginBottom: '-1px',
              transition: 'color 150ms ease, border-color 150ms ease',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Uebersicht */}
      {activeTab === 'overview' && (
        <div>
          {/* Ansprechpartner — nur bei Organisationen mit hinterlegter Person */}
          {contact.contact_kind === 'organization' && (contact.first_name || contact.last_name) && (
            <div style={{ ...cardStyle, borderLeft: '3px solid var(--color-primary)' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)', marginBottom: '0.75rem' }}>Ansprechpartner</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                {/* Avatar */}
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.85rem', color: '#000',
                }}>
                  {[(contact.first_name ?? '').charAt(0), (contact.last_name ?? '').charAt(0)].join('').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  {/* Name */}
                  <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', marginBottom: '0.2rem' }}>
                    {[contact.first_name, contact.last_name].filter(Boolean).join(' ')}
                  </div>
                  {/* Position */}
                  {contact.position && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
                      {contact.position}
                    </div>
                  )}
                  {/* Kontaktdaten inline */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.375rem' }}>
                    {contact.phones.map(p => (
                      <a key={p.id} href={`tel:${p.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', textDecoration: 'none' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>phone</span>
                        {p.phone}
                      </a>
                    ))}
                    {contact.emails.map(e => (
                      <a key={e.id} href={`mailto:${e.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', textDecoration: 'none' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>email</span>
                        {e.email}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Adressen */}
          {contact.addresses.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)', marginBottom: '0.75rem' }}>Adressen</div>
              {contact.addresses.map(addr => (
                <div key={addr.id} style={{ marginBottom: '0.625rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <Badge label={addr.label} color="rgba(255,255,255,0.08)" />
                  <span style={valueStyle}>
                    {[addr.street, `${addr.postal_code ?? ''} ${addr.city ?? ''}`.trim(), addr.country].filter(Boolean).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Kommunikation */}
          {(contact.emails.length > 0 || contact.phones.length > 0 || contact.websites.length > 0) && (
            <div style={cardStyle}>
              <div style={labelStyle}>Kommunikation</div>
              {contact.emails.map(e => (
                <div key={e.id} style={{ marginBottom: '0.375rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--color-primary)' }}>email</span>
                  <Badge label={e.label} color="rgba(255,255,255,0.08)" />
                  <a href={`mailto:${e.email}`} style={{ ...valueStyle, color: 'var(--color-primary)', textDecoration: 'none' }}>{e.email}</a>
                </div>
              ))}
              {contact.phones.map(p => (
                <div key={p.id} style={{ marginBottom: '0.375rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--color-primary)' }}>phone</span>
                  <Badge label={p.label} color="rgba(255,255,255,0.08)" />
                  <a href={`tel:${p.phone}`} style={{ ...valueStyle, color: 'var(--color-primary)', textDecoration: 'none' }}>{p.phone}</a>
                </div>
              ))}
              {contact.websites.map(w => (
                <div key={w.id} style={{ marginBottom: '0.375rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--color-primary)' }}>language</span>
                  <Badge label={w.label} color="rgba(255,255,255,0.08)" />
                  <a href={w.url} target="_blank" rel="noreferrer" style={{ ...valueStyle, color: 'var(--color-primary)', textDecoration: 'none' }}>{w.url}</a>
                </div>
              ))}
            </div>
          )}

          {/* Zahlung & Konditionen */}
          {(maskedIban || contact.bic || contact.vat_id || contact.tax_number || contact.payment_term_days || contact.discount_days || contact.customer_discount) && (
            <div style={cardStyle}>
              <div style={labelStyle}>Zahlung & Konditionen</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.625rem' }}>
                {maskedIban && <Field label="IBAN" value={maskedIban} />}
                {contact.bic && <Field label="BIC" value={contact.bic} />}
                {contact.vat_id && <Field label="USt-ID" value={contact.vat_id} />}
                {contact.tax_number && <Field label="Steuernummer" value={contact.tax_number} />}
                {contact.debtor_number && <Field label="Debitoren-Nr." value={contact.debtor_number} />}
                {contact.creditor_number && <Field label="Kreditoren-Nr." value={contact.creditor_number} />}
                {contact.payment_term_days != null && <Field label="Zahlungsziel" value={`${contact.payment_term_days} Tage`} />}
                {contact.discount_days != null && <Field label="Skonto Tage" value={String(contact.discount_days)} />}
                {contact.discount_percent != null && <Field label="Skonto %" value={`${contact.discount_percent}%`} />}
                {contact.customer_discount != null && <Field label="Kundenrabatt" value={`${contact.customer_discount}%`} />}
              </div>
            </div>
          )}

          {/* Sonstiges */}
          {(contact.birthday || contact.description || contact.tags) && (
            <div style={cardStyle}>
              <div style={labelStyle}>Sonstiges</div>
              {contact.birthday && <Field label="Geburtstag" value={new Date(contact.birthday).toLocaleDateString('de-DE')} />}
              {contact.description && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={labelStyle}>Beschreibung</div>
                  <div style={valueStyle}>{contact.description}</div>
                </div>
              )}
              {contact.tags && (
                <div>
                  <div style={labelStyle}>Tags</div>
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {contact.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                      <span key={tag} style={{
                        padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem',
                        background: 'rgba(255,255,255,0.08)', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)',
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aufgaben-Karte */}
          {(() => {
            const openTasks = contactTasks.filter(t => t.status !== 'done' && t.status !== 'archived');
            return (
              <div style={cardStyle}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>task_alt</span>
                    <span style={labelStyle}>Offene Aufgaben</span>
                  </div>
                  {openTasks.length > 0 && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '1.4rem', height: '1.4rem', borderRadius: '50%',
                      background: 'var(--color-primary)', color: '#000',
                      fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700,
                    }}>
                      {openTasks.length}
                    </span>
                  )}
                </div>

                {/* Inhalt */}
                {tasksLoading ? (
                  <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', padding: '0.5rem 0' }}>
                    Lade...
                  </div>
                ) : openTasks.length === 0 ? (
                  <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', padding: '0.25rem 0' }}>
                    Keine offenen Aufgaben.
                  </div>
                ) : (
                  <div>
                    {openTasks.slice(0, 5).map(task => {
                      const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                      return (
                        <div
                          key={task.id}
                          onClick={() => { setSelectedTask(task); setTaskSlideOpen(true); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.375rem 0',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: '1rem', color: 'var(--color-primary)', flexShrink: 0 }}
                          >
                            {STATUS_ICONS[task.status] ?? 'radio_button_unchecked'}
                          </span>
                          <span style={{
                            flex: 1, minWidth: 0,
                            fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {task.title}
                          </span>
                          {task.due_date && (
                            <span style={{
                              fontFamily: 'var(--font-body)', fontSize: '0.72rem', flexShrink: 0,
                              color: isOverdue ? '#f87171' : 'var(--color-on-surface-variant)',
                            }}>
                              {new Date(task.due_date).toLocaleDateString('de-DE')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.625rem' }}>
                  <button
                    onClick={() => { setSelectedTask(null); setTaskSlideOpen(true); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      background: 'transparent', border: 'none',
                      color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                      cursor: 'pointer', padding: '0.25rem 0',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>add</span>
                    Neue Aufgabe
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Zeiterfassungs-Karte (einklappbar) */}
          {(() => {
            const totalSeconds = contactTimeEntries.reduce((sum, e) => sum + e.duration_seconds, 0);
            return (
              <div style={cardStyle}>
                {/* Header mit Toggle */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => {
                    const next = !timeExpanded;
                    setTimeExpanded(next);
                    try { localStorage.setItem(`contact_detail_time_expanded_${id}`, String(next)); } catch {}
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>timer</span>
                    <span style={labelStyle}>Zeiterfassung</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {totalSeconds > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '0.15rem 0.5rem', borderRadius: '999px',
                        background: 'var(--color-primary)', color: '#000',
                        fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 700,
                      }}>
                        {formatDurationLong(totalSeconds)}
                      </span>
                    )}
                    <span className="material-symbols-outlined" style={{
                      fontSize: '1.1rem', color: 'var(--color-on-surface-variant)',
                      transition: 'transform 150ms ease',
                      transform: timeExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}>
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Inhalt (einklappbar) */}
                {timeExpanded && (
                  <div style={{ marginTop: '0.75rem' }}>
                    {timeEntriesLoading ? (
                      <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', padding: '0.5rem 0' }}>
                        Lade...
                      </div>
                    ) : contactTimeEntries.length === 0 ? (
                      <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', padding: '0.25rem 0' }}>
                        Keine Zeiterfassung vorhanden
                      </div>
                    ) : (
                      <div>
                        {contactTimeEntries.slice(0, 5).map(entry => (
                          <div key={entry.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.375rem 0',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', flexShrink: 0, width: '4.5rem' }}>
                              {new Date(entry.date).toLocaleDateString('de-DE')}
                            </span>
                            <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.title}
                            </span>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                              {formatDuration(entry.duration_seconds)}
                            </span>
                            {(entry.project_name || entry.client_name) && (
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-outline)', flexShrink: 0, maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {[entry.project_name, entry.client_name].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Tab: Notizen */}
      {activeTab === 'notes' && (
        <div>
          {/* Neue Notiz */}
          <div style={cardStyle}>
            <div style={labelStyle}>Neue Notiz</div>
            <textarea
              value={newNoteContent}
              onChange={e => setNewNoteContent(e.target.value)}
              placeholder="Notiz schreiben..."
              rows={3}
              style={inputStyle}
            />
            <div style={{ marginTop: '0.625rem', textAlign: 'right' }}>
              <button
                onClick={handleAddNote}
                disabled={savingNote || !newNoteContent.trim()}
                style={{
                  background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                  border: 'none', borderRadius: '0.5rem', color: '#000',
                  padding: '0.5rem 1.25rem', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600,
                  opacity: (savingNote || !newNoteContent.trim()) ? 0.5 : 1,
                }}
              >
                Speichern
              </button>
            </div>
          </div>

          {/* Notizen-Liste */}
          {contact.notes.length === 0 && (
            <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', padding: '1.5rem 0', textAlign: 'center', fontSize: '0.875rem' }}>
              Noch keine Notizen.
            </div>
          )}
          {contact.notes.map(note => (
            <div key={note.id} style={{ ...cardStyle, position: 'relative' }}>
              {editingNoteId === note.id ? (
                <>
                  <textarea
                    value={editingNoteContent}
                    onChange={e => setEditingNoteContent(e.target.value)}
                    rows={3}
                    style={inputStyle}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                    <button style={btnSecondary} onClick={() => setEditingNoteId(null)}>Abbrechen</button>
                    <button
                      onClick={() => handleUpdateNote(note.id)}
                      style={{
                        background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                        border: 'none', borderRadius: '0.5rem', color: '#000',
                        padding: '0.45rem 1rem', cursor: 'pointer',
                        fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600,
                      }}
                    >
                      Speichern
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ ...valueStyle, whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{note.content}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                      {formatDate(note.updated_at !== note.created_at ? note.updated_at : note.created_at)}
                      {note.updated_at !== note.created_at && ' (bearbeitet)'}
                    </span>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button style={btnSecondary} onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>edit</span>
                        Bearbeiten
                      </button>
                      <button style={btnDanger} onClick={() => handleDeleteNote(note)}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
                        Löschen
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Zeiterfassung */}
      {activeTab === 'time' && (
        <div>
          {timeEntriesLoading ? (
            <div style={{ ...cardStyle, color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
              Lade Zeiteinträge...
            </div>
          ) : contactTimeEntries.length === 0 ? (
            <div style={{ ...cardStyle, color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
              Keine Zeiterfassung verknüpft
            </div>
          ) : (
            <div style={cardStyle}>
              {contactTimeEntries.map((entry, idx) => (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.5rem 0',
                  borderBottom: idx < contactTimeEntries.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', flexShrink: 0, width: '5rem' }}>
                    {new Date(entry.date).toLocaleDateString('de-DE')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.title}
                    </div>
                    {(entry.project_name || entry.client_name) && (
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-outline)', marginTop: '0.1rem' }}>
                        {[entry.project_name, entry.client_name].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', fontWeight: 600, flexShrink: 0 }}>
                    {formatDuration(entry.duration_seconds)}
                  </span>
                </div>
              ))}

              {/* Gesamtstunden */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: '0.75rem', paddingTop: '0.75rem',
                borderTop: '1px solid var(--color-outline-variant)',
              }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                  Gesamt
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                  {formatDurationLong(contactTimeEntries.reduce((sum, e) => sum + e.duration_seconds, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Arbeitsmappe */}
      {activeTab === 'workbook' && (
        <div>
          {workbookLoading ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', fontFamily: 'var(--font-body)' }}>Laden...</p>
          ) : workbookPages.length === 0 ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', fontFamily: 'var(--font-body)' }}>
              Keine Arbeitsmappe-Seiten verknüpft
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {workbookPages.map((wp) => (
                <button
                  key={wp.id}
                  onClick={() => navigate('/arbeitsmappe', { state: { openPageId: wp.id } })}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '0.2rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--color-surface-container)',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-container-high)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface-container)')}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{wp.title}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-on-surface-variant)', display: 'flex', gap: '0.75rem' }}>
                    {wp.section_name && <span>{wp.section_name}</span>}
                    <span>{new Date(wp.created_at).toLocaleDateString('de-DE')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Verlauf */}
      {activeTab === 'activity' && (
        <div>
          {contact.activity_log.length === 0 && (
            <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', padding: '1.5rem 0', textAlign: 'center', fontSize: '0.875rem' }}>
              Kein Verlauf vorhanden.
            </div>
          )}
          {contact.activity_log.map(entry => (
            <div key={entry.id} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.625rem 0',
              borderBottom: '1px solid var(--color-outline-variant)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)', flexShrink: 0, marginTop: '0.1rem' }}>
                {EVENT_ICONS[entry.event_type] ?? 'info'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={valueStyle}>{entry.message}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', marginTop: '0.15rem' }}>
                  {formatDate(entry.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <TaskSlideOver
        isOpen={taskSlideOpen}
        onClose={() => { setTaskSlideOpen(false); setSelectedTask(null); }}
        task={selectedTask}
        onSave={async (data) => {
          if (selectedTask) {
            await updateTask(selectedTask.id, data);
          } else {
            await createTask({ ...data, contact_id: Number(id) });
          }
          void loadTasks();
        }}
        onDelete={async (taskId) => {
          await deleteTask(taskId);
          setTaskSlideOpen(false);
          setSelectedTask(null);
          void loadTasks();
        }}
        prefill={{ contact_id: Number(id), contact_name: name }}
      />
    </PageWrapper>
  );
}

// ---------------------------------------------------------------------------
// TaskCard — kompakte Aufgaben-Karte im Kontakt-Tab
// ---------------------------------------------------------------------------
const STATUS_ICONS: Record<string, string> = {
  open: 'radio_button_unchecked',
  in_progress: 'play_circle',
  waiting: 'pending',
  done: 'check_circle',
  archived: 'archive',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: 'rgba(255,255,255,0.3)',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Dringend',
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const isOverdue = task.due_date && task.status !== 'done' && task.status !== 'archived'
    && new Date(task.due_date) < new Date();

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.5rem',
    padding: '0.75rem 1rem',
    marginBottom: '0.625rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    transition: 'background 150ms ease',
  };

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '1.1rem', color: task.status === 'done' ? '#22c55e' : 'var(--color-primary)', flexShrink: 0, marginTop: '0.1rem' }}
      >
        {STATUS_ICONS[task.status] ?? 'radio_button_unchecked'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          color: task.status === 'done' ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
          marginBottom: '0.25rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {task.due_date && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.72rem',
              color: isOverdue ? '#f87171' : 'var(--color-on-surface-variant)',
            }}>
              {new Date(task.due_date).toLocaleDateString('de-DE')}
              {isOverdue && ' (überfällig)'}
            </span>
          )}
          <span style={{
            display: 'inline-block',
            padding: '0.1rem 0.45rem',
            borderRadius: '999px',
            fontSize: '0.68rem',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            background: PRIORITY_COLORS[task.priority] + '33',
            color: PRIORITY_COLORS[task.priority],
            border: `1px solid ${PRIORITY_COLORS[task.priority]}55`,
          }}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: Feld-Anzeige
// ---------------------------------------------------------------------------
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '0.375rem' }}>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--color-outline)', marginBottom: '0.15rem',
      }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-on-surface)' }}>{value}</div>
    </div>
  );
}

// btnDanger is only used inside the component — redeclared there as local const
const btnDanger: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: '0.5rem',
  color: '#f87171',
  padding: '0.45rem 0.875rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: '0.8rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
};
