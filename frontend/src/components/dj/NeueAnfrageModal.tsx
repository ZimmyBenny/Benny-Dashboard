import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import {
  createDjEvent, fetchDjCustomers, fetchDjEvent, fetchDjEvents, updateDjEvent, createDjTrip,
  type DjCustomer, type DjEvent, type EventType, type EventStatus, type StatusHistoryEntry,
} from '../../api/dj.api';
import { createContact, type ContactDetail } from '../../api/contacts.api';
import { createTask } from '../../api/tasks.api';
import { EVENT_TYPE_LABELS } from './StatusBadge';
import { formatDate } from '../../lib/format';
import apiClient from '../../api/client';

// ── Status-Labels ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  anfrage: 'Anfrage',
  neu: 'Neu',
  vorgespraech_vereinbart: 'Vorgespräch vereinbart',
  angebot_gesendet: 'Angebot gesendet',
  bestaetigt: 'Bestätigt',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,170,255,0.2)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  padding: '0.5rem 0.875rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: 'var(--color-on-surface-variant)',
  marginBottom: '0.35rem',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
};

// ── Eingangskanal-Optionen ────────────────────────────────────────────────────

const SOURCE_CHANNELS = [
  { value: 'email', label: 'E-Mail', icon: 'email' },
  { value: 'telefon', label: 'Telefon', icon: 'call' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { value: 'instagram', label: 'Instagram', icon: 'photo_camera' },
  { value: 'persoenlich', label: 'Persönlich', icon: 'handshake' },
  { value: 'andere', label: 'Sonstiges', icon: 'more_horiz' },
];

// ── Kundenname anzeigen ───────────────────────────────────────────────────────

function displayName(c: DjCustomer): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || `#${c.id}`;
}

// ── KundeErstellenModal ───────────────────────────────────────────────────────

interface KundeErstellenModalProps {
  onClose: () => void;
  onCreated: (customer: DjCustomer) => void;
}

function KundeErstellenModal({ onClose, onCreated }: KundeErstellenModalProps) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const navigate = useNavigate();

  const [kind, setKind] = useState<'person' | 'organization'>('person');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (kind === 'person' && !firstName.trim() && !lastName.trim()) {
      setError('Vorname oder Nachname erforderlich.');
      return;
    }
    if (kind === 'organization' && !orgName.trim()) {
      setError('Firmenname erforderlich.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<ContactDetail> = {
        contact_kind: kind,
        area: 'DJ',
        first_name: kind === 'person' ? firstName.trim() || null : null,
        last_name: kind === 'person' ? lastName.trim() || null : null,
        organization_name: kind === 'organization' ? orgName.trim() || null : null,
        emails: email.trim() ? [{ email: email.trim(), label: 'privat', is_primary: 1 } as never] : [],
        phones: phone.trim() ? [{ phone: phone.trim(), label: 'mobil', is_primary: 1 } as never] : [],
      } as Partial<ContactDetail>;
      const created = await createContact(payload);
      const customer: DjCustomer = {
        id: created.id,
        contact_kind: created.contact_kind,
        salutation: created.salutation ?? null,
        first_name: created.first_name ?? null,
        last_name: created.last_name ?? null,
        organization_name: created.organization_name ?? null,
        customer_number: created.customer_number ?? null,
        area: created.area,
        city: null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      };
      onCreated(customer);
    } catch {
      setError('Fehler beim Anlegen. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop — kein onClick: Klick außerhalb schließt Modal nicht */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1100,
        }}
      />

      {/* Sub-Modal */}
      <div
        data-draggable-modal
        style={{
          position: 'fixed',
          zIndex: 1101,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '420px',
          maxWidth: '95vw',
          background: 'rgba(6,14,32,0.99)',
          border: '1px solid rgba(148,170,255,0.3)',
          borderRadius: '1rem',
          boxShadow: '0 24px 72px rgba(0,0,0,0.8), 0 0 40px rgba(148,170,255,0.1)',
          overflow: 'hidden',
          ...modalStyle,
        }}
      >
        {/* Header */}
        <div
          onMouseDown={onMouseDown}
          style={{
            ...headerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid rgba(148,170,255,0.12)',
            background: 'rgba(148,170,255,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#94aaff' }}>person_add</span>
            <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-on-surface)' }}>
              Neuen Kunden anlegen
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex', padding: '0.25rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>

          {/* Person / Unternehmen Toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['person', 'organization'] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                style={{
                  flex: 1,
                  background: kind === k ? 'rgba(148,170,255,0.15)' : 'rgba(255,255,255,0.03)',
                  border: kind === k ? '1px solid #94aaff' : '1px solid rgba(148,170,255,0.2)',
                  borderRadius: '0.5rem',
                  color: kind === k ? '#94aaff' : 'var(--color-on-surface-variant)',
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  fontWeight: kind === k ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.375rem',
                  transition: 'all 120ms',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                  {k === 'person' ? 'person' : 'apartment'}
                </span>
                {k === 'person' ? 'Person' : 'Unternehmen'}
              </button>
            ))}
          </div>

          {/* Felder */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {kind === 'person' ? (
              <>
                <div>
                  <label style={labelStyle}>Vorname</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    style={inputStyle}
                    placeholder="Max"
                    autoFocus
                  />
                </div>
                <div>
                  <label style={labelStyle}>Nachname</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    style={inputStyle}
                    placeholder="Mustermann"
                  />
                </div>
              </>
            ) : (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Firmenname</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  style={inputStyle}
                  placeholder="Musterfirma GmbH"
                  autoFocus
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="max@beispiel.de"
              />
            </div>
            <div>
              <label style={labelStyle}>Telefon</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={inputStyle}
                placeholder="+49 ..."
              />
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: '0.75rem', padding: '0.5rem 0.75rem',
              background: 'rgba(255,110,132,0.12)', border: '1px solid rgba(255,110,132,0.3)',
              borderRadius: '0.5rem', color: 'var(--color-error)',
              fontFamily: 'var(--font-body)', fontSize: '0.8rem',
            }}>
              {error}
            </div>
          )}

          {/* Link zum vollständigen Formular */}
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => { onClose(); navigate('/contacts/new?area=DJ'); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)',
                fontSize: '0.75rem', textDecoration: 'underline', padding: 0,
                opacity: 0.7,
              }}
            >
              → Vollständiges Kontaktformular öffnen
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,170,255,0.2)',
                borderRadius: '0.5rem', color: 'var(--color-on-surface-variant)',
                padding: '0.5rem 1rem', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              }}
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                border: 'none', borderRadius: '0.5rem', color: '#060e20',
                padding: '0.5rem 1.25rem', cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'Manrope, sans-serif', fontSize: '0.85rem', fontWeight: 700,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Anlegen…' : 'Anlegen'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── NeueAnfrageModal ──────────────────────────────────────────────────────────

export interface NeueAnfrageModalProps {
  onClose: () => void;
  onCreated: () => void;
  eventId?: number | null;
  onUpdated?: () => void;
}

export function NeueAnfrageModal({ onClose, onCreated, eventId, onUpdated }: NeueAnfrageModalProps) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const queryClient = useQueryClient();

  const isEdit = !!eventId;

  // Form-State
  const [sourceChannel, setSourceChannel] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerFreetext, setCustomerFreetext] = useState('');
  const [eventType, setEventType] = useState<EventType>('hochzeit');
  const [eventDate, setEventDate] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

  // Neue Felder
  const [venueName, setVenueName] = useState('');
  const [venueStreet, setVenueStreet] = useState('');
  const [venueZip, setVenueZip] = useState('');
  const [venueCity, setVenueCity] = useState('');
  const [guests, setGuests] = useState('');
  const [status, setStatus] = useState<EventStatus>('anfrage');
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [loadingEvent, setLoadingEvent] = useState(false);

  // Vorgespräch-Felder (nur Edit-Modus)
  const [vorgStatus, setVorgStatus] = useState<'offen' | 'erledigt' | null>(null);
  const [vorgDatum, setVorgDatum] = useState('');
  const [vorgPlz, setVorgPlz] = useState('');
  const [vorgOrt, setVorgOrt] = useState('');
  const [vorgNotizen, setVorgNotizen] = useState('');

  // Fahrten-Dialog
  const [showFahrtenDialog, setShowFahrtenDialog] = useState(false);
  const [fahrtenStart, setFahrtenStart] = useState('');
  const [fahrtenKm, setFahrtenKm] = useState('');
  const [fahrtenSaving, setFahrtenSaving] = useState(false);
  const [fahrtenError, setFahrtenError] = useState<string | null>(null);

  // Aufgaben-Erstellen
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskCreatedCount, setTaskCreatedCount] = useState(0);

  // Kunden-Picker
  const [customers, setCustomers] = useState<DjCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Sub-Modal
  const [showKundeModal, setShowKundeModal] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kalender
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [calendars, setCalendars] = useState<{ id: string; title: string; color?: string }[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');

  // Datum-Kollision
  const [allEvents, setAllEvents] = useState<DjEvent[]>([]);
  const [conflictingEvents, setConflictingEvents] = useState<DjEvent[]>([]);

  // Original-Snapshot für Kalender-Sync im Edit-Modus
  const originalRef = useRef<{
    event_date: string | null;
    time_start: string | null;
    time_end: string | null;
    calendar_uid: string | null;
    status: EventStatus;
    event_type: EventType;
    venue_name: string | null;
    location_name: string | null;
    customer_name: string | null;
    customer_org: string | null;
  } | null>(null);

  useEffect(() => {
    void fetchDjCustomers().then(setCustomers).catch(() => {});
    void fetchDjEvents().then(setAllEvents).catch(() => {});
    // Kalender vorab laden damit selectedCalendarId sofort verfügbar ist
    if (!isEdit) {
      void apiClient.get('/calendar/calendars').then(r => {
        const list = r.data as { id: string; title: string; color?: string }[];
        setCalendars(list);
        const djCal = list.find(c => c.title.toLowerCase().replace(/[-\s]/g, '') === 'djtermine') ?? list[0];
        if (djCal) setSelectedCalendarId(djCal.id);
      }).catch(() => {});
    }
  }, [isEdit]);

  // Edit-Modus: Event-Daten laden
  useEffect(() => {
    if (!eventId) return;
    setLoadingEvent(true);
    void fetchDjEvent(eventId).then(data => {
      setSourceChannel(data.source_channel ?? '');
      setCustomerId(data.customer_id);
      setEventType(data.event_type);
      setEventDate(data.event_date ?? '');
      setTimeStart(data.time_start ?? '');
      setTimeEnd(data.time_end ?? '');
      setTitle(data.title ?? '');
      setNotes(data.notes ?? '');
      setVenueName(data.venue_name ?? '');
      setVenueStreet(data.venue_street ?? '');
      setVenueZip(data.venue_zip ?? '');
      setVenueCity(data.venue_city ?? '');
      setGuests(data.guests != null ? String(data.guests) : '');
      setStatus(data.status);
      setStatusHistory(data.statusHistory ?? []);
      setVorgStatus(data.vorgespraech_status ?? null);
      setVorgDatum(data.vorgespraech_datum ?? '');
      setVorgPlz(data.vorgespraech_plz ?? '');
      setVorgOrt(data.vorgespraech_ort ?? '');
      setVorgNotizen(data.vorgespraech_notizen ?? '');
      // Original-Snapshot für Kalender-Sync merken
      originalRef.current = {
        event_date: data.event_date ?? null,
        time_start: data.time_start ?? null,
        time_end: data.time_end ?? null,
        calendar_uid: data.calendar_uid ?? null,
        status: data.status,
        event_type: data.event_type,
        venue_name: data.venue_name ?? null,
        location_name: data.location_name ?? null,
        customer_name: data.customer_name ?? null,
        customer_org: data.customer_org ?? null,
      };
    }).catch(() => {}).finally(() => setLoadingEvent(false));
  }, [eventId]);

  // Picker: Klick außerhalb schließt
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);


  const filteredCustomers = customers
    .filter(c => {
      if (!customerSearch.trim()) return true;
      const q = customerSearch.toLowerCase();
      return (
        (c.first_name ?? '').toLowerCase().includes(q) ||
        (c.last_name ?? '').toLowerCase().includes(q) ||
        (c.organization_name ?? '').toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  const selectedCustomer = customers.find(c => c.id === customerId) ?? null;

  async function handleSave() {
    setSaving(true);
    setError(null);

    if (!eventDate || !eventDate.trim()) {
      setError('Bitte ein Eventdatum auswählen.');
      setSaving(false);
      return;
    }

    try {
      const combinedNotes = isEdit
        ? (notes.trim() || null)
        : [
            customerFreetext.trim() ? `Kundendaten: ${customerFreetext.trim()}` : '',
            notes.trim(),
          ].filter(Boolean).join('\n\n') || null;

      const payload = {
        event_type: eventType,
        event_date: eventDate,
        title: title.trim() || null,
        customer_id: customerId,
        time_start: timeStart || null,
        time_end: timeEnd || null,
        notes: combinedNotes,
        source_channel: sourceChannel || null,
        venue_name: venueName.trim() || null,
        venue_street: venueStreet.trim() || null,
        venue_zip: venueZip.trim() || null,
        venue_city: venueCity.trim() || null,
        guests: guests ? Number(guests) : null,
      };

      if (isEdit) {
        await updateDjEvent(eventId!, {
          ...payload,
          status,
          vorgespraech_datum: vorgDatum || null,
          vorgespraech_plz: vorgPlz || null,
          vorgespraech_ort: vorgOrt || null,
          vorgespraech_notizen: vorgNotizen || null,
        } as Parameters<typeof updateDjEvent>[1]);

        // Kalender-Sync: Nur wenn Event einen Kalender-Eintrag hat und sich Datum/Zeit geändert hat.
        const orig = originalRef.current;
        const dateChanged = orig && orig.event_date !== eventDate;
        const startChanged = orig && (orig.time_start ?? '') !== (timeStart ?? '');
        const endChanged = orig && (orig.time_end ?? '') !== (timeEnd ?? '');
        if (orig?.calendar_uid && eventDate && (dateChanged || startChanged || endChanged)) {
          async function syncCalendarOnEdit(oldUid: string) {
            // 1. Kalender-ID bestimmen — selectedCalendarId ist nur im Create-Modus gefüllt.
            let calId = selectedCalendarId;
            if (!calId) {
              const r = await apiClient.get('/calendar/calendars');
              const list = r.data as { id: string; title: string }[];
              const djCal = list.find(c => c.title.toLowerCase().replace(/[-\s]/g, '') === 'djtermine') ?? list[0];
              calId = djCal?.id ?? '';
              if (!calId) throw new Error('Kalender "DJ-Termine" nicht gefunden');
            }

            // 2. Alten Eintrag löschen (Fehler ignorieren — kann bereits manuell gelöscht sein)
            await apiClient.delete(`/calendar/events/${encodeURIComponent(oldUid)}`).catch(() => {});

            // 3. Neuen Eintrag anlegen
            const typLabel = EVENT_TYPE_LABELS[eventType] || eventType;
            const kundenLabel = selectedCustomer
              ? displayName(selectedCustomer)
              : (orig?.customer_name || orig?.customer_org || null);

            const prefix = status === 'bestaetigt' ? 'Gebucht' : 'Anfrage';
            const calTitle = kundenLabel
              ? `${prefix} – ${typLabel} | ${kundenLabel}`
              : `${prefix} – ${typLabel}`;

            const startTime = (timeStart || '12:00').substring(0, 5);
            const endRaw = timeEnd ? timeEnd.substring(0, 5) : null;

            // TZ-Offset
            const offsetMin = -new Date().getTimezoneOffset();
            const tzSign = offsetMin >= 0 ? '+' : '-';
            const tzH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
            const tzM = String(Math.abs(offsetMin) % 60).padStart(2, '0');
            const tz = `${tzSign}${tzH}:${tzM}`;

            // Mitternacht-Crossing
            let endDate = eventDate;
            let endTime: string;
            const nextDay = () => {
              const d = new Date(eventDate + 'T00:00:00Z');
              d.setUTCDate(d.getUTCDate() + 1);
              return d.toISOString().substring(0, 10);
            };
            if (!endRaw) {
              const [h, m] = startTime.split(':').map(Number);
              const newH = h + 3;
              endTime = `${String(newH % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
              if (newH >= 24) endDate = nextDay();
            } else if (endRaw <= startTime) {
              endTime = endRaw;
              endDate = nextDay();
            } else {
              endTime = endRaw;
            }

            const locationLabel = venueName || orig?.location_name || '';
            const notesBlock = [
              `Kunde: ${kundenLabel ?? 'Unbekannt'}`,
              `Veranstaltungstyp: ${typLabel}`,
              locationLabel ? `Location: ${locationLabel}` : '',
            ].filter(Boolean).join('\n');

            const res = await apiClient.post('/calendar/events', {
              calendar_id: calId,
              title: calTitle,
              start_at: `${eventDate}T${startTime}:00${tz}`,
              end_at: `${endDate}T${endTime}:00${tz}`,
              notes: notesBlock,
            });
            const newUid = (res.data as { event?: { apple_uid?: string } })?.event?.apple_uid;
            if (newUid) {
              await updateDjEvent(eventId!, { calendar_uid: newUid } as Partial<DjEvent>);
              // Ref aktualisieren falls User nochmal speichert
              if (originalRef.current) {
                originalRef.current.calendar_uid = newUid;
                originalRef.current.event_date = eventDate;
                originalRef.current.time_start = timeStart || null;
                originalRef.current.time_end = timeEnd || null;
              }
            }
          }

          try {
            await syncCalendarOnEdit(orig.calendar_uid);
          } catch (calErr) {
            const msg = calErr instanceof Error ? calErr.message : String(calErr);
            setError(`Gespeichert, aber Kalender konnte nicht aktualisiert werden: ${msg}`);
            return; // setSaving(false) wird im finally erledigt
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['dj-events'] });
        onUpdated?.();
      } else {
        const newEvent = await createDjEvent({ ...payload, status: 'anfrage' } as Parameters<typeof createDjEvent>[0]);
        // Kalender-Eintrag anlegen
        if (addToCalendar && eventDate) {
          if (!selectedCalendarId) {
            setError('Kalender "DJ-Termine" nicht gefunden. Anfrage wurde trotzdem gespeichert.');
          } else {
            const startTime = timeStart || '12:00';
            const endTime = timeEnd || (timeStart
              ? `${String(Number(timeStart.split(':')[0]) + 1).padStart(2, '0')}:${timeStart.split(':')[1]}`
              : '13:00');
            const typLabel = EVENT_TYPE_LABELS[eventType] || eventType;
            const kundenLabel = selectedCustomer
              ? displayName(selectedCustomer)
              : customerFreetext.trim() || null;
            const calTitle = kundenLabel
              ? `Anfrage – ${typLabel} | ${kundenLabel}`
              : `Anfrage – ${typLabel}`;
            try {
              const offsetMin = -new Date().getTimezoneOffset();
              const tzSign = offsetMin >= 0 ? '+' : '-';
              const tzH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
              const tzM = String(Math.abs(offsetMin) % 60).padStart(2, '0');
              const tz = `${tzSign}${tzH}:${tzM}`;
              const res = await apiClient.post('/calendar/events', {
                title: calTitle,
                start_at: `${eventDate}T${startTime}:00${tz}`,
                end_at: `${eventDate}T${endTime}:00${tz}`,
                calendar_id: selectedCalendarId,
                notes: customerFreetext.trim() ? `Kundendaten: ${customerFreetext.trim()}` : undefined,
              });
              const calUid = (res.data as { event?: { apple_uid?: string } })?.event?.apple_uid;
              if (calUid && newEvent?.id) {
                await updateDjEvent(newEvent.id, { calendar_uid: calUid } as Partial<DjEvent>);
              }
            } catch (calErr: unknown) {
              const msg = calErr instanceof Error ? calErr.message : String(calErr);
              setError(`Anfrage gespeichert, aber Kalender-Eintrag fehlgeschlagen: ${msg}`);
            }
          }
        }
        await queryClient.invalidateQueries({ queryKey: ['dj-events'] });
        onCreated();
      }
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop — kein onClick: Klick außerhalb schließt Modal nicht */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div
        data-draggable-modal
        style={{
          position: 'fixed',
          zIndex: 1001,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '580px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(6,14,32,0.98)',
          border: '1px solid rgba(148,170,255,0.25)',
          borderRadius: '1.25rem',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 60px rgba(148,170,255,0.06)',
          ...modalStyle,
        }}
      >
        {/* Header (verschiebbar) */}
        <div
          onMouseDown={onMouseDown}
          style={{
            ...headerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(148,170,255,0.12)',
            background: 'rgba(148,170,255,0.03)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#94aaff' }}>
              {isEdit ? 'edit_note' : 'event_note'}
            </span>
            <span style={{
              fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.1rem',
              color: 'var(--color-on-surface)', letterSpacing: '-0.01em',
            }}>
              {isEdit ? 'Anfrage bearbeiten' : 'Neue Anfrage'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex', padding: '0.25rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>

          {/* ── Lade-Spinner (Edit-Modus) ─────────────────────────── */}
          {loadingEvent && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.5 }}>hourglass_empty</span>
              Lade Anfragedaten…
            </div>
          )}

          {!loadingEvent && (<>

          {/* ── Eingangskanal ─────────────────────────────────────── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Eingangskanal</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {SOURCE_CHANNELS.map(ch => {
                const active = sourceChannel === ch.value;
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => setSourceChannel(active ? '' : ch.value)}
                    style={{
                      background: active ? 'rgba(148,170,255,0.15)' : 'rgba(255,255,255,0.04)',
                      border: active ? '1px solid #94aaff' : '1px solid rgba(148,170,255,0.2)',
                      borderRadius: '999px',
                      color: active ? '#94aaff' : 'var(--color-on-surface-variant)',
                      padding: '0.375rem 0.875rem',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.8rem',
                      fontWeight: active ? 600 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      transition: 'all 120ms',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>{ch.icon}</span>
                    {ch.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Kunde ─────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Kunde</label>
              <button
                type="button"
                onClick={() => setShowKundeModal(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94aaff', fontFamily: 'var(--font-body)', fontSize: '0.75rem',
                  fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>person_add</span>
                Neuen Kunden anlegen
              </button>
            </div>

            <div style={{ position: 'relative' }} ref={pickerRef}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => { setPickerOpen(v => !v); setCustomerSearch(''); }}
                onKeyDown={e => { if (e.key === 'Enter') setPickerOpen(v => !v); }}
                style={{
                  ...inputStyle,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                <span style={{ color: selectedCustomer ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)' }}>
                  {selectedCustomer ? displayName(selectedCustomer) : 'Kontakt wählen…'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setCustomerId(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex', padding: 0 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
                    </button>
                  )}
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)' }}>
                    {pickerOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>

              {pickerOpen && (
                <div style={{
                  position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, marginTop: '0.25rem',
                  background: 'rgba(6,14,32,0.99)', border: '1px solid rgba(148,170,255,0.2)',
                  borderRadius: '0.75rem', padding: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Kontakt suchen…"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    style={{ ...inputStyle, marginBottom: '0.5rem' }}
                  />
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {filteredCustomers.length === 0 ? (
                      <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', margin: '0.25rem 0' }}>
                        Keine DJ-Kunden gefunden.
                      </p>
                    ) : filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCustomerId(c.id); setPickerOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                          background: c.id === customerId ? 'rgba(148,170,255,0.1)' : 'none',
                          border: 'none', borderRadius: '0.5rem', padding: '0.5rem 0.625rem',
                          cursor: 'pointer', textAlign: 'left', color: 'var(--color-on-surface)',
                          fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                        }}
                        onMouseEnter={e => { if (c.id !== customerId) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseLeave={e => { if (c.id !== customerId) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#94aaff', flexShrink: 0 }}>
                          {c.contact_kind === 'organization' ? 'apartment' : 'person'}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {displayName(c)}
                        </span>
                        {c.id === customerId && (
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#94aaff', marginLeft: 'auto' }}>check</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Freitext-Zeile für Kundendaten */}
          <div style={{ marginTop: '0.625rem' }}>
            <input
              type="text"
              placeholder="Oder Kundendaten kurz notieren (z.B. Max Mustermann, 0176 1234567)…"
              value={customerFreetext}
              onChange={e => setCustomerFreetext(e.target.value)}
              style={{
                ...inputStyle,
                fontSize: '0.8rem',
                color: 'var(--color-on-surface-variant)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed rgba(148,170,255,0.2)',
              }}
            />
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid rgba(148,170,255,0.1)', margin: '1.5rem 0' }} />

          {/* ── Veranstaltung ─────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>

            {/* Eventdatum */}
            <div>
              <label style={labelStyle}>Eventdatum *</label>
              <input
                type={eventDate ? 'date' : 'text'}
                value={eventDate}
                placeholder="Datum wählen…"
                autoComplete="off"
                onFocus={e => { e.currentTarget.type = 'date'; }}
                onBlur={e => { if (!e.currentTarget.value) e.currentTarget.type = 'text'; }}
                onChange={e => {
                  const newDate = e.target.value;
                  setEventDate(newDate);
                  if (newDate) {
                    setConflictingEvents(allEvents.filter(ev => ev.event_date === newDate));
                  } else {
                    setConflictingEvents([]);
                  }
                }}
                style={inputStyle}
              />
            </div>

            {conflictingEvents.length > 0 && (
              <div style={{
                gridColumn: '1 / -1',
                background: 'rgba(255,200,0,0.07)',
                border: '1px solid rgba(255,200,0,0.3)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#ffc800', flexShrink: 0, marginTop: '0.1rem' }}>warning</span>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#ffc800', lineHeight: 1.5 }}>
                  <strong>Bereits {conflictingEvents.length} Anfrage{conflictingEvents.length > 1 ? 'n' : ''} an diesem Tag:</strong>
                  <br />
                  {conflictingEvents.map(ev => {
                    const kunde = ev.customer_name || ev.customer_org || null;
                    const typ = EVENT_TYPE_LABELS[ev.event_type as keyof typeof EVENT_TYPE_LABELS] || ev.event_type;
                    const label = ev.title || typ;
                    return kunde ? `${kunde} – ${label}` : label;
                  }).join(' · ')}
                </div>
              </div>
            )}

            {/* Veranstaltungstyp */}
            <div>
              <label style={labelStyle}>Veranstaltungstyp *</label>
              <select
                value={eventType}
                onChange={e => setEventType(e.target.value as EventType)}
                style={{ ...inputStyle, appearance: 'none' as const }}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {/* Beginn */}
            <div>
              <label style={labelStyle}>Beginn</label>
              <input
                type={timeStart ? 'time' : 'text'}
                value={timeStart}
                placeholder="Uhrzeit…"
                autoComplete="off"
                onFocus={e => { e.currentTarget.type = 'time'; }}
                onBlur={e => { if (!e.currentTarget.value) e.currentTarget.type = 'text'; }}
                onChange={e => setTimeStart(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Ende */}
            <div>
              <label style={labelStyle}>Ende</label>
              <input
                type={timeEnd ? 'time' : 'text'}
                value={timeEnd}
                placeholder="Uhrzeit…"
                autoComplete="off"
                onFocus={e => { e.currentTarget.type = 'time'; }}
                onBlur={e => { if (!e.currentTarget.value) e.currentTarget.type = 'text'; }}
                onChange={e => setTimeEnd(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Titel */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Titel / Veranstaltungsname</label>
              <input
                type="text"
                placeholder="z.B. Hochzeit Müller & Schmidt"
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Status (nur Edit-Modus) */}
            {isEdit && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as EventStatus)}
                  style={{ ...inputStyle, appearance: 'none' as const }}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Veranstaltungslocation */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Veranstaltungslocation</label>
              <input
                type="text"
                placeholder="z.B. Alte Glasfabrik, Schloss Neuschwanstein…"
                value={venueName}
                onChange={e => setVenueName(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Straße / PLZ / Stadt */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Straße / Adresse</label>
                  <input
                    type="text"
                    placeholder="Musterstraße 12"
                    value={venueStreet}
                    onChange={e => setVenueStreet(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>PLZ</label>
                  <input
                    type="text"
                    placeholder="12345"
                    value={venueZip}
                    onChange={e => setVenueZip(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Stadt</label>
                  <input
                    type="text"
                    placeholder="München"
                    value={venueCity}
                    onChange={e => setVenueCity(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Gästeanzahl */}
            <div>
              <label style={labelStyle}>Gästeanzahl</label>
              <input
                type="number"
                min={0}
                placeholder="z.B. 150"
                value={guests}
                onChange={e => setGuests(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Notizen */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notizen</label>
              <textarea
                placeholder="Erste Infos, Kundenwünsche, Besonderheiten…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' as const }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: '1rem', padding: '0.625rem 0.875rem',
              background: 'rgba(255,110,132,0.12)', border: '1px solid rgba(255,110,132,0.3)',
              borderRadius: '0.5rem', color: 'var(--color-error)',
              fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>error</span>
              {error}
            </div>
          )}

          {/* Kalender-Option (nur Create-Modus) */}
          {!isEdit && (
            <div style={{ marginTop: '1.25rem', padding: '0.875rem 1rem', background: 'rgba(148,170,255,0.05)', border: '1px solid rgba(148,170,255,0.12)', borderRadius: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={addToCalendar}
                  onChange={e => setAddToCalendar(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#94aaff', cursor: 'pointer' }}
                />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#94aaff' }}>calendar_add_on</span>
                  Termin in Kalender eintragen
                </span>
              </label>

              {addToCalendar && (
                <div style={{ marginTop: '0.625rem', paddingLeft: '1.625rem' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
                    Kalender: <strong style={{ color: '#94aaff' }}>DJ-Termine</strong>
                    <br />
                    Titel: „Anfrage – {title.trim() || EVENT_TYPE_LABELS[eventType] || eventType}"
                  </p>
                  {!selectedCalendarId && calendars.length === 0 && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-error)', margin: '0.25rem 0 0', opacity: 0.8 }}>
                      Kalender „DJ-Termine" nicht gefunden — wird beim Speichern übersprungen.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
            marginTop: '1.5rem', paddingTop: '1.25rem',
            borderTop: '1px solid rgba(148,170,255,0.1)',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,170,255,0.2)',
                borderRadius: '0.5rem', color: 'var(--color-on-surface-variant)',
                padding: '0.5rem 1rem', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '0.875rem',
              }}
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                border: 'none', borderRadius: '0.5rem', color: '#060e20',
                padding: '0.5rem 1.5rem', cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'Manrope, sans-serif', fontSize: '0.875rem', fontWeight: 700,
                boxShadow: '0 0 16px rgba(148,170,255,0.3)',
                opacity: saving ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: '0.375rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>save</span>
              {saving ? 'Speichern…' : (isEdit ? 'Änderungen speichern' : 'Anfrage speichern')}
            </button>
          </div>

          {/* Vorgespräch-Sektion (nur Edit-Modus, wenn Status gesetzt) */}
          {isEdit && vorgStatus && (
            <div style={{ borderTop: '1px solid rgba(148,170,255,0.1)', marginTop: '1.5rem', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#ffc457' }}>forum</span>
                <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', margin: 0 }}>
                  Vorgespräch
                </h3>
                <span style={{
                  marginLeft: '0.25rem',
                  background: vorgStatus === 'offen' ? 'rgba(255,196,87,0.15)' : 'rgba(92,253,128,0.12)',
                  border: vorgStatus === 'offen' ? '1px solid rgba(255,196,87,0.4)' : '1px solid rgba(92,253,128,0.3)',
                  borderRadius: '999px', padding: '0.15rem 0.6rem',
                  fontSize: '0.72rem', fontWeight: 600,
                  color: vorgStatus === 'offen' ? '#ffc457' : '#5cfd80',
                  fontFamily: 'var(--font-body)',
                }}>
                  {vorgStatus === 'offen' ? 'Offen' : 'Erledigt'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {/* Datum (read-only) */}
                {vorgDatum && (
                  <div>
                    <label style={labelStyle}>Datum</label>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', padding: '0.5rem 0.875rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(148,170,255,0.1)' }}>
                      {new Date(vorgDatum + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                  </div>
                )}

                {/* PLZ + Ort */}
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>PLZ</label>
                    <input type="text" value={vorgPlz} onChange={e => setVorgPlz(e.target.value)} placeholder="12345" maxLength={10} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ort</label>
                    <input type="text" value={vorgOrt} onChange={e => setVorgOrt(e.target.value)} placeholder="z.B. Café Muster, Videocall, …" style={inputStyle} />
                  </div>
                </div>

                {/* Notizen / Ergebnis */}
                <div>
                  <label style={labelStyle}>Notizen / Ergebnis</label>
                  <textarea value={vorgNotizen} onChange={e => setVorgNotizen(e.target.value)} rows={3} placeholder="Themen, Ergebnis, nächste Schritte…" style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {/* Fahrten-Button */}
                {(vorgDatum || vorgPlz || vorgOrt) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFahrtenStart('');
                      setFahrtenKm('');
                      setShowFahrtenDialog(true);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      background: 'rgba(255,196,87,0.08)', border: '1px solid rgba(255,196,87,0.3)',
                      borderRadius: '0.5rem', padding: '0.5rem 0.875rem',
                      color: '#ffc457', fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                      fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>directions_car</span>
                    In Fahrten übernehmen
                  </button>
                )}
              </div>

              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '0.75rem', marginBottom: 0 }}>
                Wird beim Speichern übernommen. Status ändern über das Vorgespräch-Menü in der Events-Liste.
              </p>
            </div>
          )}

          {/* Aufgaben (nur Edit-Modus) */}
          {isEdit && (
            <div style={{ borderTop: '1px solid rgba(148,170,255,0.1)', marginTop: '1.5rem', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>task_alt</span>
                <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', margin: 0 }}>
                  Aufgabe erstellen
                </h3>
                {taskCreatedCount > 0 && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-secondary)' }}>
                    ✓ {taskCreatedCount} erstellt
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Aufgabe</label>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="z.B. Angebot schreiben, Vertrag senden…"
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && newTaskTitle.trim()) {
                        e.preventDefault();
                        setTaskSaving(true);
                        try {
                          await createTask({
                            title: newTaskTitle.trim(),
                            area: 'dj',
                            contact_id: customerId ?? null,
                            project_or_customer: title.trim() || undefined,
                            due_date: newTaskDue || null,
                            status: 'open',
                            priority: 'medium',
                          });
                          setNewTaskTitle('');
                          setNewTaskDue('');
                          setTaskCreatedCount(n => n + 1);
                        } catch { /* ignore */ }
                        finally { setTaskSaving(false); }
                      }
                    }}
                    style={inputStyle}
                  />
                </div>
                <div style={{ width: '140px' }}>
                  <label style={labelStyle}>Fällig am</label>
                  <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                </div>
                <button
                  type="button"
                  disabled={!newTaskTitle.trim() || taskSaving}
                  onClick={async () => {
                    if (!newTaskTitle.trim()) return;
                    setTaskSaving(true);
                    try {
                      await createTask({
                        title: newTaskTitle.trim(),
                        area: 'dj',
                        contact_id: customerId ?? null,
                        project_or_customer: title.trim() || undefined,
                        due_date: newTaskDue || null,
                        status: 'open',
                        priority: 'medium',
                      });
                      setNewTaskTitle('');
                      setNewTaskDue('');
                      setTaskCreatedCount(n => n + 1);
                    } catch { /* ignore */ }
                    finally { setTaskSaving(false); }
                  }}
                  style={{
                    background: 'rgba(148,170,255,0.15)', border: '1px solid rgba(148,170,255,0.3)',
                    borderRadius: '0.5rem', padding: '0.5rem 0.875rem',
                    color: 'var(--color-primary)', fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem', fontWeight: 600, cursor: newTaskTitle.trim() ? 'pointer' : 'not-allowed',
                    opacity: newTaskTitle.trim() ? 1 : 0.4, whiteSpace: 'nowrap',
                    marginBottom: '1px',
                  }}
                >
                  {taskSaving ? '…' : '+ Hinzufügen'}
                </button>
              </div>
            </div>
          )}

          {/* Status-Verlauf (nur Edit-Modus) */}
          {isEdit && statusHistory.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(148,170,255,0.1)', marginTop: '1.5rem', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>history</span>
                <h3 style={{
                  fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--color-on-surface)', margin: 0,
                }}>
                  Status-Verlauf
                </h3>
              </div>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: '1rem',
                padding: '0.5rem 0.75rem',
                borderBottom: '1px solid rgba(148,170,255,0.15)',
                marginBottom: '0.25rem',
              }}>
                {['Datum', 'Von', 'Nach'].map(col => (
                  <span key={col} style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600,
                    color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {col}
                  </span>
                ))}
              </div>
              {statusHistory.map((entry, idx) => {
                const dateObj = new Date(entry.created_at);
                const dateStr = formatDate(entry.created_at);
                const timeStr = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: '1rem',
                      padding: '0.625rem 0.75rem',
                      borderTop: idx === 0 ? 'none' : '1px solid rgba(148,170,255,0.15)',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                      {dateStr}{timeStr ? ` ${timeStr}` : ''}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                      {entry.from_status ? (STATUS_LABELS[entry.from_status] ?? entry.from_status) : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)' }}>
                      {STATUS_LABELS[entry.to_status] ?? entry.to_status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          </>)}
        </div>
      </div>

      {/* Fahrten-Dialog */}
      {showFahrtenDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10100,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }} onClick={e => { if (e.target === e.currentTarget) setShowFahrtenDialog(false); }}>
          <div style={{
            background: '#0d1526', border: '1px solid rgba(255,196,87,0.2)',
            borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '440px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-on-surface)', margin: 0, marginBottom: '1.25rem' }}>
              Fahrt eintragen
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={labelStyle}>Startort</label>
                <input type="text" value={fahrtenStart} onChange={e => setFahrtenStart(e.target.value)} placeholder="z.B. 12345 Heimatort" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Ziel</label>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', padding: '0.5rem 0.875rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(148,170,255,0.1)' }}>
                  {[vorgPlz, vorgOrt].filter(Boolean).join(' ') || '—'}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Datum</label>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', padding: '0.5rem 0.875rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(148,170,255,0.1)' }}>
                  {vorgDatum ? new Date(vorgDatum + 'T00:00:00').toLocaleDateString('de-DE') : new Date().toLocaleDateString('de-DE')}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Kilometer (einfache Strecke)</label>
                <input type="number" min="1" step="1" value={fahrtenKm} onChange={e => setFahrtenKm(e.target.value)} placeholder="z.B. 35" style={inputStyle} />
                {fahrtenKm && Number(fahrtenKm) > 0 && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-secondary)', marginTop: '0.375rem', marginBottom: 0 }}>
                    → {(Math.round(Number(fahrtenKm)) * 0.30).toFixed(2)} € Fahrtkosten (0,30 €/km)
                  </p>
                )}
              </div>
            </div>
            {fahrtenError && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: '#ff6b6b', marginTop: '0.75rem', marginBottom: 0 }}>
                Fehler: {fahrtenError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" onClick={() => setShowFahrtenDialog(false)} style={{ background: 'transparent', border: '1px solid rgba(148,170,255,0.2)', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', cursor: 'pointer' }}>
                Abbrechen
              </button>
              <button
                type="button"
                disabled={!fahrtenKm || Number(fahrtenKm) <= 0 || fahrtenSaving}
                onClick={async () => {
                  const km = Math.round(Number(fahrtenKm));
                  if (!km || km <= 0) return;
                  setFahrtenSaving(true);
                  setFahrtenError(null);
                  try {
                    const ziel = [vorgPlz, vorgOrt].filter(Boolean).join(' ') || 'Vorgespräch';
                    const eventName = title.trim() || (selectedCustomer ? [selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(' ') || selectedCustomer.organization_name : '') || 'Event';
                    const dateStr = vorgDatum || new Date().toISOString().slice(0, 10);
                    const rate = 0.30;
                    await createDjTrip({
                      expense_date: dateStr,
                      start_location: fahrtenStart || 'Heimatort',
                      end_location: ziel,
                      distance_km: km,
                      purpose: `Vorgespräch – ${eventName}`,
                      rate_per_km: rate,
                      reimbursement_amount: Math.round(km * rate * 100) / 100,
                    });
                    setShowFahrtenDialog(false);
                    setFahrtenKm('');
                  } catch (err: unknown) {
                    setFahrtenError(err instanceof Error ? err.message : 'Fehler beim Speichern');
                  }
                  finally { setFahrtenSaving(false); }
                }}
                style={{
                  background: 'rgba(255,196,87,0.15)', border: '1px solid rgba(255,196,87,0.5)',
                  borderRadius: '0.5rem', padding: '0.625rem 1.25rem',
                  color: '#ffc457', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600,
                  cursor: fahrtenKm && Number(fahrtenKm) > 0 ? 'pointer' : 'not-allowed',
                  opacity: fahrtenKm && Number(fahrtenKm) > 0 ? 1 : 0.4,
                }}
              >
                {fahrtenSaving ? 'Speichern…' : 'Fahrt eintragen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KundeErstellenModal (Sub-Modal) */}
      {showKundeModal && (
        <KundeErstellenModal
          onClose={() => setShowKundeModal(false)}
          onCreated={customer => {
            setCustomers(prev => [customer, ...prev]);
            setCustomerId(customer.id);
            setShowKundeModal(false);
          }}
        />
      )}
    </>
  );
}
