import { useState, useEffect, type FormEvent } from 'react';
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
            title="Loeschen"
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

// ── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const navigate = useNavigate();

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
      setPwError('Die neuen Passwoerter stimmen nicht ueberein.');
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
        setPwError(response?.data?.error ?? 'Passwort konnte nicht geaendert werden.');
      } else {
        setPwError('Passwort konnte nicht geaendert werden.');
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

  return (
    <PageWrapper>
      <h1
        className="text-3xl font-bold mb-8"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        Einstellungen
      </h1>

      <div className="space-y-6">
        {/* App-Version */}
        <Card>
          <div className="p-6">
            <h2
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              Ueber die App
            </h2>
            <p style={{ color: 'var(--color-on-surface-variant)' }}>
              Benny Dashboard v{__APP_VERSION__}
            </p>
          </div>
        </Card>

        {/* Passwort aendern */}
        <Card>
          <div className="p-6">
            <h2
              className="text-lg font-semibold mb-4"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              Passwort aendern
            </h2>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              <Input
                label="Aktuelles Passwort"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Input
                label="Neues Passwort"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <Input
                label="Neues Passwort bestaetigen"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {pwError && (
                <p className="text-sm" style={{ color: 'var(--color-error)' }}>
                  {pwError}
                </p>
              )}
              {pwSuccess && (
                <p className="text-sm" style={{ color: 'var(--color-primary)' }}>
                  {pwSuccess}
                </p>
              )}
              <div>
                <Button variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Wird geaendert...' : 'Passwort aendern'}
                </Button>
              </div>
            </form>
          </div>
        </Card>

        {/* Schnellzugriff */}
        <Card>
          <div className="p-6">
            <h2
              className="text-lg font-semibold mb-4"
              style={{
                fontFamily: 'var(--font-headline)',
                color: 'var(--color-on-surface)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span className="material-symbols-outlined" style={{
                fontSize: '1.25rem',
                color: 'var(--color-primary)',
              }}>bolt</span>
              Schnellzugriff
            </h2>

            {/* Sortierbare Liste */}
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
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--color-on-surface-variant)',
                textAlign: 'center',
                padding: '1rem 0',
              }}>
                Noch keine Schnellzugriffe vorhanden.
              </p>
            )}

            {qlError && (
              <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
                {qlError}
              </p>
            )}

            {/* Neuen Link hinzufuegen */}
            <form
              onSubmit={handleAddLink}
              style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <p style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface-variant)',
                marginBottom: '0.75rem',
              }}>
                Neuen Link hinzufuegen
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <Input
                    label="Label"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="z.B. Google"
                  />
                </div>
                <div style={{ flex: '2 1 220px' }}>
                  <Input
                    label="URL"
                    value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div style={{ flexShrink: 0, paddingBottom: '1px' }}>
                  <Button variant="primary" type="submit">
                    Hinzufuegen
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </Card>

        {/* Session / Logout */}
        <Card>
          <div className="p-6">
            <h2
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              Session
            </h2>
            <p className="mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
              Aktive Session beenden und zum Login zurueckkehren.
            </p>
            <Button variant="secondary" type="button" onClick={handleLogout}>
              Abmelden
            </Button>
          </div>
        </Card>
      </div>
    </PageWrapper>
  );
}
