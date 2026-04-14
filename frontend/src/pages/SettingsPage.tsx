import { useState, useEffect, type FormEvent } from 'react';
import { useUiStore } from '../store/uiStore';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { logoutRequest } from '../api/auth.api';
import { changePassword } from '../api/user.api';
import {
  fetchQuickLinks,
  createQuickLink,
  updateQuickLink,
  deleteQuickLink,
  reorderQuickLinks,
  type QuickLink,
} from '../api/quickLinks.api';

declare const __APP_VERSION__: string;

// ── SortableItem ─────────────────────────────────────────────────────────────

interface SortableItemProps {
  link: QuickLink;
  editingId: number | null;
  editLabel: string;
  editUrl: string;
  onEditStart: (link: QuickLink) => void;
  onEditLabelChange: (v: string) => void;
  onEditUrlChange: (v: string) => void;
  onEditSave: (id: number) => void;
  onEditCancel: () => void;
  onToggleVisible: (link: QuickLink) => void;
  onDelete: (id: number) => void;
}

function SortableItem({
  link,
  editingId,
  editLabel,
  editUrl,
  onEditStart,
  onEditLabelChange,
  onEditUrlChange,
  onEditSave,
  onEditCancel,
  onToggleVisible,
  onDelete,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: link.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.625rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255,255,255,0.06)',
    background: isDragging ? 'rgba(204,151,255,0.06)' : 'transparent',
    marginBottom: '0.375rem',
  };

  const isEditing = editingId === link.id;

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle */}
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: '18px',
          color: 'var(--color-outline)',
          cursor: isDragging ? 'grabbing' : 'grab',
          flexShrink: 0,
          userSelect: 'none',
        }}
        {...attributes}
        {...listeners}
      >
        drag_indicator
      </span>

      {isEditing ? (
        /* Inline edit form */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Input
            label="Label"
            value={editLabel}
            onChange={e => onEditLabelChange(e.target.value)}
          />
          <Input
            label="URL"
            value={editUrl}
            onChange={e => onEditUrlChange(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary" type="button" onClick={() => onEditSave(link.id)}>
              Speichern
            </Button>
            <Button variant="secondary" type="button" onClick={onEditCancel}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        /* Display row */
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: 'var(--color-on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {link.label}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            color: 'var(--color-on-surface-variant)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {link.url}
          </p>
        </div>
      )}

      {!isEditing && (
        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
          {/* Toggle visible */}
          <button
            type="button"
            title={link.visible ? 'Ausblenden' : 'Einblenden'}
            onClick={() => onToggleVisible(link)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0.3rem',
              background: 'none', border: 'none', cursor: 'pointer',
              borderRadius: '0.375rem',
            }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: '18px',
              color: link.visible ? 'var(--color-primary)' : 'var(--color-outline)',
            }}>
              {link.visible ? 'visibility' : 'visibility_off'}
            </span>
          </button>

          {/* Edit */}
          <button
            type="button"
            title="Bearbeiten"
            onClick={() => onEditStart(link)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0.3rem',
              background: 'none', border: 'none', cursor: 'pointer',
              borderRadius: '0.375rem',
            }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: '18px',
              color: 'var(--color-on-surface-variant)',
            }}>
              edit
            </span>
          </button>

          {/* Delete */}
          <button
            type="button"
            title="Löschen"
            onClick={() => onDelete(link.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0.3rem',
              background: 'none', border: 'none', cursor: 'pointer',
              borderRadius: '0.375rem',
            }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: '18px',
              color: 'var(--color-error)',
            }}>
              delete
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── AccordionHeader ───────────────────────────────────────────────────────────

function AccordionHeader({
  id, icon, title, subtitle, openSection, onToggle,
}: {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  openSection: string | null;
  onToggle: (id: string) => void;
}) {
  const isOpen = openSection === id;
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.25rem',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
        background: isOpen ? 'rgba(204,151,255,0.15)' : 'rgba(255,255,255,0.05)',
        transition: 'background 0.2s',
      }}>
        <span className="material-symbols-outlined" style={{
          fontSize: '20px',
          color: isOpen ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
          transition: 'color 0.2s',
        }}>{icon}</span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-headline)',
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: isOpen ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
          transition: 'color 0.2s',
          lineHeight: 1.3,
        }}>{title}</p>
        {subtitle && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            color: 'var(--color-outline)',
            marginTop: '0.1rem',
          }}>{subtitle}</p>
        )}
      </div>
      <span className="material-symbols-outlined" style={{
        fontSize: '20px',
        color: 'var(--color-outline)',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s',
        flexShrink: 0,
      }}>expand_more</span>
    </button>
  );
}

// ── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const navigate = useNavigate();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  // ── Password change state ──
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Quick-Links state ──
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [qlError, setQlError] = useState('');

  const [openSection, setOpenSection] = useState<string | null>(null);
  function toggleSection(id: string) {
    setOpenSection(prev => prev === id ? null : id);
  }

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    fetchQuickLinks().then(setLinks).catch(() => {});
  }, []);

  // ── Password handlers ──
  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword !== confirmPassword) {
      setPwError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('Das neue Passwort muss mindestens 8 Zeichen haben.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPwSuccess('Passwort erfolgreich geaendert.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { error?: string } } }).response;
        setPwError(response?.data?.error ?? 'Passwort konnte nicht geändert werden.');
      } else {
        setPwError('Passwort konnte nicht geändert werden.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await logoutRequest();
    navigate('/login', { replace: true });
  }

  // ── Quick-Links handlers ──
  function handleEditStart(link: QuickLink) {
    setEditingId(link.id);
    setEditLabel(link.label);
    setEditUrl(link.url);
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditLabel('');
    setEditUrl('');
  }

  async function handleEditSave(id: number) {
    try {
      const updated = await updateQuickLink(id, { label: editLabel, url: editUrl });
      setLinks(prev => prev.map(l => l.id === id ? updated : l));
      setEditingId(null);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { error?: string } } }).response;
        setQlError(response?.data?.error ?? 'Link konnte nicht gespeichert werden.');
      }
    }
  }

  async function handleToggleVisible(link: QuickLink) {
    try {
      const updated = await updateQuickLink(link.id, { visible: !link.visible });
      setLinks(prev => prev.map(l => l.id === link.id ? updated : l));
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteQuickLink(id);
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch {
      // ignore
    }
  }

  async function handleAddLink(e: FormEvent) {
    e.preventDefault();
    setQlError('');
    if (!newLabel.trim() || !newUrl.trim()) {
      setQlError('Label und URL sind erforderlich.');
      return;
    }
    try {
      const created = await createQuickLink({ label: newLabel.trim(), url: newUrl.trim() });
      setLinks(prev => [...prev, created]);
      setNewLabel('');
      setNewUrl('');
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { error?: string } } }).response;
        setQlError(response?.data?.error ?? 'Link konnte nicht erstellt werden.');
      } else {
        setQlError('Link konnte nicht erstellt werden.');
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = links.findIndex(l => l.id === active.id);
    const newIndex = links.findIndex(l => l.id === over.id);
    const reordered = arrayMove(links, oldIndex, newIndex);
    setLinks(reordered); // optimistic update
    reorderQuickLinks(reordered.map(l => l.id)).catch(() => {});
  }

  // Accordion header component (inline)
  return (
    <PageWrapper>
      <h1 style={{
        fontFamily: 'var(--font-headline)',
        fontSize: '1.75rem',
        fontWeight: 700,
        marginBottom: '2rem',
        letterSpacing: '-0.01em',
        background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        Einstellungen
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Dashboard starten */}
        <Card>
          <AccordionHeader openSection={openSection} onToggle={toggleSection} id="start" icon="rocket_launch" title="Dashboard starten" subtitle="Anleitung zum Starten & Neustarten" />
          {openSection === 'start' && (
            <div style={{ padding: '0 1.25rem 1.25rem' }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { icon: 'mouse',    text: 'Doppelklick auf start.command im Finder — Terminal öffnet sich und alles startet automatisch.' },
                  { icon: 'public',   text: 'Safari öffnet sich selbständig auf http://localhost:5173 — das Dashboard ist bereit.' },
                  { icon: 'terminal', text: 'Terminal-Fenster offen lassen. Schließen beendet Frontend und Backend.' },
                  { icon: 'sensors',  text: 'Die zwei Punkte unten in der Seitenleiste zeigen den Status: grün = alles läuft.' },
                  { icon: 'refresh',  text: 'Hängt das Backend, einfach den ↺-Button daneben klicken — es startet automatisch neu.' },
                  { icon: 'warning',  text: 'Bleibt die Ampel rot: start.command nie doppelt öffnen. Im Terminal kill $(lsof -ti :3001) eingeben — danach startet das Backend von selbst neu.' },
                ].map(({ icon, text }, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0, background: 'rgba(204,151,255,0.1)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--color-primary)' }}>{icon}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55, paddingTop: '0.2rem' }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Erscheinungsbild */}
        <Card>
          <AccordionHeader openSection={openSection} onToggle={toggleSection} id="appearance" icon="palette" title="Erscheinungsbild" subtitle={`Aktuell: ${theme === 'dark' ? 'Dunkel' : 'Hell'}`} />
          {openSection === 'appearance' && (
            <div style={{ padding: '0 1.25rem 1.25rem' }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                {(['dark', 'light'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 500,
                      background: theme === t ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)' : 'var(--color-surface-container-high)',
                      color: theme === t ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
                      transition: 'background 150ms ease, color 150ms ease',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{t === 'dark' ? 'dark_mode' : 'light_mode'}</span>
                    {t === 'dark' ? 'Dunkel' : 'Hell'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Passwort ändern */}
        <Card>
          <AccordionHeader openSection={openSection} onToggle={toggleSection} id="password" icon="lock" title="Passwort ändern" />
          {openSection === 'password' && (
            <div style={{ padding: '0 1.25rem 1.25rem' }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <Input label="Aktuelles Passwort" type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} autoComplete="current-password" required />
                  <Input label="Neues Passwort" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required />
                  <Input label="Neues Passwort bestätigen" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
                  {pwError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-error)' }}>{pwError}</p>}
                  {pwSuccess && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-primary)' }}>{pwSuccess}</p>}
                  <div>
                    <Button variant="primary" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Wird geändert…' : 'Passwort ändern'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </Card>

        {/* Schnellzugriff */}
        <Card>
          <AccordionHeader openSection={openSection} onToggle={toggleSection} id="quicklinks" icon="bolt" title="Schnellzugriff" subtitle={`${links.length} Link${links.length !== 1 ? 's' : ''}`} />
          {openSection === 'quicklinks' && (
            <div style={{ padding: '0 1.25rem 1.25rem' }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={links.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {links.map(link => (
                      <SortableItem
                        key={link.id}
                        link={link}
                        editingId={editingId}
                        editLabel={editLabel}
                        editUrl={editUrl}
                        onEditStart={handleEditStart}
                        onEditLabelChange={setEditLabel}
                        onEditUrlChange={setEditUrl}
                        onEditSave={handleEditSave}
                        onEditCancel={handleEditCancel}
                        onToggleVisible={handleToggleVisible}
                        onDelete={handleDelete}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {links.length === 0 && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textAlign: 'center', padding: '1rem 0' }}>
                    Noch keine Schnellzugriffe vorhanden.
                  </p>
                )}
                {qlError && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-error)', marginTop: '0.5rem' }}>{qlError}</p>}
                <form onSubmit={handleAddLink} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
                    Neuen Link hinzufügen
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 140px' }}>
                      <Input label="Label" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="z.B. Google" />
                    </div>
                    <div style={{ flex: '2 1 220px' }}>
                      <Input label="URL" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…" />
                    </div>
                    <div style={{ flexShrink: 0, paddingBottom: '1px' }}>
                      <Button variant="primary" type="submit">Hinzufügen</Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </Card>

      </div>
    </PageWrapper>
  );
}
