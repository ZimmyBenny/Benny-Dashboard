import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchDjEvents, fetchDjEvent, deleteDjEvent, updateDjEvent, setDjEventVorgespraech, type DjEvent, type EventStatus } from '../../api/dj.api';
import { StatusBadge, EVENT_TYPE_LABELS } from '../../components/dj/StatusBadge';
import { formatDate } from '../../lib/format';
import { NeueAnfrageModal } from '../../components/dj/NeueAnfrageModal';
import apiClient from '../../api/client';

// ── Filter-Konfiguration ───────────────────────────────────────────────────────

const VORG_FILTER = '_vorgespraeche';

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'Alle', value: '' },
  { label: 'Anfrage', value: 'anfrage' },
  { label: 'Vorgespräch', value: 'vorgespraech_vereinbart' },
  { label: 'Offene Vorgespräche', value: VORG_FILTER },
  { label: 'Angebot', value: 'angebot_gesendet' },
  { label: 'Bestätigt', value: 'bestaetigt' },
  { label: 'Abgeschlossen', value: 'abgeschlossen' },
  { label: 'Abgesagt', value: 'abgesagt' },
];

const STATUS_OPTIONS: EventStatus[] = [
  'anfrage',
  'vorgespraech_vereinbart',
  'angebot_gesendet',
  'bestaetigt',
  'abgeschlossen',
  'abgesagt',
];

// ── DjEventsPage ───────────────────────────────────────────────────────────────

export function DjEventsPage() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [searchParams] = useSearchParams();

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('filter') ?? '');
  const [showNeueAnfrage, setShowNeueAnfrage] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusPickerId, setStatusPickerId] = useState<number | null>(null);
  const [statusPickerPos, setStatusPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [calToast, setCalToast] = useState<string | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [djCalendarId, setDjCalendarId] = useState<string | null>(null);
  const djCalendarIdRef = useRef<string | null>(null);

  // 3-Punkt-Menü
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Vorgespräch-Dialog (planen / bearbeiten)
  const [vorgDialogEvent, setVorgDialogEvent] = useState<DjEvent | null>(null);
  const [vorgDatum, setVorgDatum] = useState('');
  const [vorgUhrzeit, setVorgUhrzeit] = useState('');
  const [vorgPlz, setVorgPlz] = useState('');
  const [vorgOrt, setVorgOrt] = useState('');
  const [vorgNotizen, setVorgNotizen] = useState('');

  // Vorgespräch-Erledigt-Dialog
  const [vorgErledigtEvent, setVorgErledigtEvent] = useState<DjEvent | null>(null);
  const [vorgKm, setVorgKm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // DJ-Kalender-ID vorab laden — Ref für stableCallback, State für UI
  useEffect(() => {
    void apiClient.get('/calendar/calendars').then(r => {
      const list = r.data as { id: string; title: string }[];
      const djCal = list.find(c => c.title.toLowerCase().replace(/[-\s]/g, '') === 'djtermine') ?? list[0];
      if (djCal) { setDjCalendarId(djCal.id); djCalendarIdRef.current = djCal.id; }
    }).catch(() => {});
  }, []);

  // Datenladen
  const { data: allEvents = [], isLoading } = useQuery<DjEvent[]>({
    queryKey: ['dj-events', selectedYear ?? 'upcoming'],
    queryFn: () => fetchDjEvents(selectedYear ? { year: selectedYear } : {}),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDjEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-events'] }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: EventStatus; event?: DjEvent }) =>
      updateDjEvent(id, { status }),
    onSuccess: async (_, { status, event }) => {
      queryClient.invalidateQueries({ queryKey: ['dj-events'] });
      setStatusPickerId(null);
      setStatusPickerPos(null);

      // Kalender-Eintrag löschen bei Absage
      if (status === 'abgesagt' && event) {
        const freshEvent = await fetchDjEvent(event.id).catch(() => null);
        if (freshEvent?.calendar_uid) {
          const deleted = await apiClient
            .delete(`/calendar/events/${encodeURIComponent(freshEvent.calendar_uid)}`)
            .then(() => true)
            .catch(() => false);
          // calendar_uid immer leeren — auch wenn Eintrag in Apple Calendar nicht mehr existiert
          await updateDjEvent(event.id, { calendar_uid: null } as Partial<DjEvent>);
          queryClient.invalidateQueries({ queryKey: ['dj-events'] });
          if (deleted) {
            setCalToast('Kalendereintrag wurde gelöscht.');
            setTimeout(() => setCalToast(null), 4000);
          }
        }
        return;
      }

      // Auto-Kalender bei Bestätigung
      if (status === 'bestaetigt' && event && event.event_date) {
        // Frischen Stand vom Server holen (Cache könnte alte calendar_uid haben)
        const freshEvent = await fetchDjEvent(event.id).catch(() => null);
        if (freshEvent?.calendar_uid) return; // Eintrag existiert bereits

        const calId = djCalendarIdRef.current;
        if (!calId) {
          setCalError('Kalender "DJ Termine" nicht gefunden. Bitte Kalender-Sync prüfen.');
          setTimeout(() => setCalError(null), 8000);
          return;
        }

        const typLabel = EVENT_TYPE_LABELS[event.event_type] || event.event_type;
        const kundenLabel = event.customer_name || event.customer_org || 'Unbekannt';
        const locationLabel = event.venue_name || event.location_name || '';
        const calTitle = `Gebucht – ${typLabel} | ${kundenLabel}`;
        const startTime = event.time_start?.substring(0, 5) || '20:00';
        const endRaw = event.time_end?.substring(0, 5);
        // Lokaler Timezone-Offset (z.B. "+02:00" für CEST)
        const offsetMin = -new Date().getTimezoneOffset();
        const tzSign = offsetMin >= 0 ? '+' : '-';
        const tzH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
        const tzM = String(Math.abs(offsetMin) % 60).padStart(2, '0');
        const tz = `${tzSign}${tzH}:${tzM}`;
        // Mitternacht-Crossing: end < start → end ist am Folgetag
        let endDate = event.event_date;
        let endTime: string;
        const nextDay = () => {
          const d = new Date(event.event_date + 'T00:00:00Z');
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
        try {
          const res = await apiClient.post('/calendar/events', {
            calendar_id: calId,
            title: calTitle,
            start_at: `${event.event_date}T${startTime}:00${tz}`,
            end_at: `${endDate}T${endTime}:00${tz}`,
            notes: [
              `Kunde: ${kundenLabel}`,
              `Veranstaltungstyp: ${typLabel}`,
              locationLabel ? `Location: ${locationLabel}` : '',
            ].filter(Boolean).join('\n'),
          });
          const calUid = (res.data as { event?: { apple_uid?: string } })?.event?.apple_uid;
          if (calUid) {
            await updateDjEvent(event.id, { calendar_uid: calUid } as Partial<DjEvent>);
            queryClient.invalidateQueries({ queryKey: ['dj-events'] });
          }
          setCalToast(`Kalendereintrag "${calTitle}" wurde angelegt.`);
          setTimeout(() => setCalToast(null), 5000);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
          setCalError(`Kalendereintrag konnte nicht erstellt werden: ${msg}`);
          setTimeout(() => setCalError(null), 8000);
        }
      }
    },
  });

  // Vorgespräch-Mutation
  const vorgMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof setDjEventVorgespraech>[1] }) =>
      setDjEventVorgespraech(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-events'] });
      queryClient.invalidateQueries({ queryKey: ['dj-overview'] });
      setVorgDialogEvent(null);
      setVorgErledigtEvent(null);
      setIsSaving(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setCalError(`Vorgespräch konnte nicht gespeichert werden: ${msg}`);
      setTimeout(() => setCalError(null), 6000);
      setIsSaving(false);
    },
  });

  // Klick außerhalb schließt Status-Dropdown
  useEffect(() => {
    if (statusPickerId === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-status-picker]')) { setStatusPickerId(null); setStatusPickerPos(null); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusPickerId]);

  // Klick außerhalb schließt 3-Punkt-Menü
  useEffect(() => {
    if (menuOpenId === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-vorg-menu]')) { setMenuOpenId(null); setMenuPos(null); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  // Client-seitige Filterung nach Status
  const filtered = useMemo(() => {
    if (!statusFilter) return allEvents;
    if (statusFilter === VORG_FILTER) return allEvents.filter(e => e.vorgespraech_status === 'offen');
    return allEvents.filter(e => e.status === statusFilter);
  }, [allEvents, statusFilter]);

  // Volltextsuche über gefilterte Events
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return filtered;
    const q = search.trim().toLowerCase();
    return filtered.filter(e =>
      (e.title?.toLowerCase().includes(q)) ||
      (e.customer_name?.toLowerCase().includes(q)) ||
      (e.customer_org?.toLowerCase().includes(q)) ||
      (e.location_name?.toLowerCase().includes(q)) ||
      (e.venue_name?.toLowerCase().includes(q)) ||
      (EVENT_TYPE_LABELS[e.event_type]?.toLowerCase().includes(q))
    );
  }, [filtered, search]);

  // Zähler für alle Filter-Pillen
  const tabCounts = useMemo(() => {
    return {
      '': allEvents.length,
      anfrage: allEvents.filter(e => e.status === 'anfrage').length,
      vorgespraech_vereinbart: allEvents.filter(e => e.status === 'vorgespraech_vereinbart').length,
      [VORG_FILTER]: allEvents.filter(e => e.vorgespraech_status === 'offen').length,
      angebot_gesendet: allEvents.filter(e => e.status === 'angebot_gesendet').length,
      bestaetigt: allEvents.filter(e => e.status === 'bestaetigt').length,
      abgeschlossen: allEvents.filter(e => e.status === 'abgeschlossen').length,
      abgesagt: allEvents.filter(e => e.status === 'abgesagt').length,
    } as Record<string, number>;
  }, [allEvents]);

  // KPI-Berechnungen (aus allEvents, nicht filtered)
  const kpiOffene = allEvents.filter(e => ['anfrage', 'neu', 'vorgespraech_vereinbart', 'angebot_gesendet'].includes(e.status)).length;
  const kpiBestaetigt = allEvents.filter(e => e.status === 'bestaetigt').length;
  const kpiAbgeschlossen = allEvents.filter(e => e.status === 'abgeschlossen').length;

  // Jahres-Optionen: aktuelles Jahr - 1 bis + 3
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

  // Hilfsfunktion: Vorgespräch-Dialog öffnen
  const openVorgDialog = (ev: DjEvent) => {
    setVorgDatum(ev.vorgespraech_datum ?? '');
    setVorgUhrzeit('');
    setVorgPlz(ev.vorgespraech_plz ?? '');
    setVorgOrt(ev.vorgespraech_ort ?? '');
    setVorgNotizen(ev.vorgespraech_notizen ?? '');
    setVorgDialogEvent(ev);
    setMenuOpenId(null);
    setMenuPos(null);
  };

  // Hilfsfunktion: Vorgespräch speichern
  const saveVorgespraech = async () => {
    if (!vorgDialogEvent || isSaving) return;
    setIsSaving(true);
    const calId = djCalendarIdRef.current;
    let calUid: string | null | undefined = undefined; // undefined = nicht ändern

    // Kalender-Eintrag erstellen wenn Datum gesetzt
    if (vorgDatum && calId) {
      const uhr = vorgUhrzeit || '10:00';
      const endH = (parseInt(uhr.split(':')[0]) + 1) % 24;
      const endUhr = `${String(endH).padStart(2, '0')}:${uhr.split(':')[1] ?? '00'}`;
      const offsetMin = -new Date().getTimezoneOffset();
      const tzSign = offsetMin >= 0 ? '+' : '-';
      const tzH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
      const tzM = String(Math.abs(offsetMin) % 60).padStart(2, '0');
      const tz = `${tzSign}${tzH}:${tzM}`;

      const kundenLabel = vorgDialogEvent.customer_name || vorgDialogEvent.customer_org || 'Unbekannt';
      const calTitle = `Vorgespräch – ${kundenLabel}`;
      const notes = [
        vorgOrt ? `Ort: ${vorgOrt}` : '',
        vorgNotizen ? `Notiz: ${vorgNotizen}` : '',
      ].filter(Boolean).join('\n');

      // Alten Eintrag löschen falls vorhanden
      if (vorgDialogEvent.vorgespraech_calendar_uid) {
        await apiClient.delete(`/calendar/events/${encodeURIComponent(vorgDialogEvent.vorgespraech_calendar_uid)}`).catch(() => {});
      }

      try {
        const res = await apiClient.post('/calendar/events', {
          calendar_id: calId,
          title: calTitle,
          start_at: `${vorgDatum}T${uhr}:00${tz}`,
          end_at: `${vorgDatum}T${endUhr}:00${tz}`,
          notes: notes || undefined,
        });
        calUid = (res.data as { event?: { apple_uid?: string } })?.event?.apple_uid ?? null;
        setCalToast(`Kalender: "${calTitle}" eingetragen.`);
        setTimeout(() => setCalToast(null), 5000);
      } catch {
        setCalError('Vorgespräch-Kalendertermin konnte nicht erstellt werden.');
        setTimeout(() => setCalError(null), 6000);
      }
    }

    vorgMut.mutate({
      id: vorgDialogEvent.id,
      data: {
        action: 'offen',
        datum: vorgDatum || undefined,
        plz: vorgPlz || undefined,
        ort: vorgOrt || undefined,
        notizen: vorgNotizen || undefined,
        calendar_uid: calUid,
      },
    });
  };

  return (
    <PageWrapper>
      <style>{`
        .dj-events-table tbody tr:hover td {
          background: rgba(255,255,255,0.03);
        }
        .dj-events-table tbody tr td {
          transition: background 120ms;
        }
        .dj-edit-btn:hover {
          background: rgba(255,255,255,0.1) !important;
        }
        .dj-status-option:hover {
          background: rgba(255,255,255,0.05) !important;
        }
        .dj-vorg-menu-item:hover {
          background: rgba(255,255,255,0.06) !important;
        }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>

        {/* Ambient Glow oben rechts (blau) */}
        <div style={{
          position: 'absolute',
          top: '-100px',
          right: '-100px',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(148,170,255,0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Ambient Glow unten links (grün) */}
        <div style={{
          position: 'absolute',
          bottom: '-80px',
          left: '-80px',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(92,253,128,0.04) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Content über den Glows */}
        <div style={{ position: 'relative', zIndex: 1 }}>

          {/* ── Page Header ──────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                fontSize: '3rem',
                letterSpacing: '-0.02em',
                color: 'var(--color-on-surface)',
                margin: 0,
                lineHeight: 1.1,
              }}>
                ANFRAGEN & EVENTS
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              {/* Jahr-Dropdown */}
              <select
                value={selectedYear ?? ''}
                onChange={ev => setSelectedYear(ev.target.value === '' ? null : Number(ev.target.value))}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--color-on-surface)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 0.875rem',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="">Alle kommenden</option>
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {/* + Neue Anfrage */}
              <button
                onClick={() => setShowNeueAnfrage(true)}
                style={{
                  background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                  color: '#060e20',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontFamily: 'Manrope, sans-serif',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  boxShadow: '0 0 16px rgba(148,170,255,0.3)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Neues Event
              </button>
            </div>
          </div>

          {/* ── KPI-Kacheln ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>

            {/* Offene Anfragen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Offene Anfragen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-tertiary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiOffene}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-tertiary)', opacity: 0.7 }}>
                mark_email_unread
              </span>
            </div>

            {/* Bestätigt */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Bestätigt
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiBestaetigt}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', opacity: 0.7 }}>
                check_circle
              </span>
            </div>

            {/* Abgeschlossen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Abgeschlossen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-secondary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiAbgeschlossen}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-secondary)', opacity: 0.7 }}>
                task_alt
              </span>
            </div>

          </div>

          {/* ── Status-Filter-Pillen ──────────────────────────────── */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {FILTER_TABS.map(tab => {
              const active = statusFilter === tab.value;
              const isVorgTab = tab.value === VORG_FILTER;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    background: active
                      ? (isVorgTab ? 'rgba(255,196,87,0.15)' : 'rgba(148,170,255,0.15)')
                      : 'rgba(255,255,255,0.03)',
                    border: active
                      ? (isVorgTab ? '1px solid rgba(255,196,87,0.6)' : '1px solid var(--color-primary)')
                      : '1px solid rgba(148,170,255,0.15)',
                    borderRadius: '999px',
                    color: active
                      ? (isVorgTab ? '#ffc457' : 'var(--color-primary)')
                      : 'var(--color-on-surface-variant)',
                    padding: '0.375rem 1rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    fontWeight: active ? 600 : 500,
                    transition: 'all 120ms',
                  }}
                >
                  {tab.label}
                  <span style={{
                    marginLeft: '0.375rem',
                    background: active
                      ? (isVorgTab ? 'rgba(255,196,87,0.25)' : 'rgba(148,170,255,0.3)')
                      : 'rgba(148,170,255,0.12)',
                    borderRadius: '999px',
                    padding: '0.05rem 0.45rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: active
                      ? (isVorgTab ? '#ffc457' : '#94aaff')
                      : 'var(--color-on-surface-variant)',
                  }}>
                    {tabCounts[tab.value] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Suchfeld ─────────────────────────────────────────── */}
          {!isLoading && (
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute',
                  left: '0.875rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1.1rem',
                  color: 'rgba(148,170,255,0.4)',
                  pointerEvents: 'none',
                }}
              >
                search
              </span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen nach Titel, Kunde, Location..."
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(148,170,255,0.15)',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 1rem',
                  paddingLeft: '2.5rem',
                  color: 'var(--color-on-surface)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* ── Event-Tabelle ─────────────────────────────────────── */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>hourglass_empty</span>
              Lade...
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem' }}>
              <table className="dj-events-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Eventdatum', 'Kunde', 'Typ', 'Event-Typ', 'Location', 'Status', 'Eingang', ''].map((col, i) => (
                      <th
                        key={i}
                        style={{
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.07em',
                          color: 'rgba(148,170,255,0.5)',
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          borderBottom: '1px solid rgba(148,170,255,0.15)',
                          fontFamily: 'var(--font-body)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searchFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--color-on-surface-variant)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', opacity: 0.4 }}>event_busy</span>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>
                          Keine Veranstaltungen für diesen Filter.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    searchFiltered.map(e => {
                      // Tage bis Event
                      const daysUntil = (() => {
                        if (!e.event_date || e.status === 'abgesagt' || e.status === 'abgeschlossen') return null;
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const d = new Date(e.event_date + 'T00:00:00');
                        if (isNaN(d.getTime())) return null;
                        const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
                        return diff >= 0 ? diff : null;
                      })();

                      const rowBg: Record<string, string> = {
                        anfrage:                 'rgba(148,170,255,0.06)',
                        vorgespraech_vereinbart: 'rgba(148,170,255,0.06)',
                        angebot_gesendet:        'rgba(148,170,255,0.08)',
                        bestaetigt:              'rgba(166,140,255,0.08)',
                        abgeschlossen:           'rgba(92,253,128,0.07)',
                        abgesagt:                'rgba(255,110,132,0.06)',
                      };

                      const tdStyle: React.CSSProperties = {
                        padding: '0.875rem 1rem',
                        borderBottom: '1px solid rgba(148,170,255,0.08)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.875rem',
                        color: 'var(--color-on-surface)',
                      };

                      // Eventdatum + optionale Uhrzeit
                      const eventDateStr = formatDate(e.event_date) +
                        (e.time_start ? ' / ' + e.time_start.substring(0, 5) : '');

                      const hasVorg = e.vorgespraech_status === 'offen';

                      return (
                        <tr key={e.id} style={{ background: rowBg[e.status] ?? 'transparent' }}>
                          {/* Spalte 1: Eventdatum */}
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {eventDateStr}
                              {daysUntil !== null && (
                                <span style={{
                                  background: daysUntil === 0
                                    ? 'rgba(255,110,132,0.2)'
                                    : daysUntil <= 7
                                      ? 'rgba(255,110,132,0.15)'
                                      : daysUntil <= 30
                                        ? 'rgba(255,196,87,0.15)'
                                        : 'rgba(148,170,255,0.1)',
                                  border: `1px solid ${daysUntil === 0
                                    ? 'rgba(255,110,132,0.7)'
                                    : daysUntil <= 7
                                      ? 'rgba(255,110,132,0.5)'
                                      : daysUntil <= 30
                                        ? 'rgba(255,196,87,0.5)'
                                        : 'rgba(148,170,255,0.3)'}`,
                                  color: daysUntil === 0
                                    ? '#ff6e84'
                                    : daysUntil <= 7
                                      ? '#ff6e84'
                                      : daysUntil <= 30
                                        ? '#ffc457'
                                        : 'rgba(148,170,255,0.7)',
                                  borderRadius: '999px',
                                  padding: '0.1rem 0.5rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-body)',
                                }}>
                                  {daysUntil === 0 ? 'Heute' : daysUntil === 1 ? '1 Tag' : `${daysUntil} Tage`}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Spalte 2: Kunde */}
                          <td style={tdStyle}>
                            {e.customer_name || e.customer_org || '—'}
                          </td>

                          {/* Spalte 3: Typ */}
                          <td style={tdStyle}>
                            <span style={{
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: '0.25rem',
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              color: 'var(--color-on-surface-variant)',
                              whiteSpace: 'nowrap',
                            }}>
                              {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
                            </span>
                          </td>

                          {/* Spalte 4: Event-Typ (Freitext / Titel) */}
                          <td style={{ ...tdStyle, color: 'var(--color-on-surface-variant)', fontStyle: e.title ? 'normal' : 'italic', fontSize: '0.82rem' }}>
                            {e.title || '—'}
                          </td>

                          {/* Spalte 5: Location */}
                          <td style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                            {e.venue_name || e.location_name || '—'}
                          </td>

                          {/* Spalte 6: Status (klickbar mit Inline-Dropdown) */}
                          <td style={{ ...tdStyle }}>
                            <div
                              data-status-picker={statusPickerId === e.id ? 'open' : undefined}
                              style={{ display: 'inline-block' }}
                            >
                              <div
                                onClick={(evt) => {
                                  if (statusPickerId === e.id) {
                                    setStatusPickerId(null);
                                    setStatusPickerPos(null);
                                  } else {
                                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                                    setStatusPickerPos({ top: rect.bottom + 6, left: rect.left });
                                    setStatusPickerId(e.id);
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                <StatusBadge status={e.status} />
                              </div>

                              {statusPickerId === e.id && statusPickerPos && (
                                <div
                                  data-status-picker="dropdown"
                                  style={{
                                    position: 'fixed',
                                    top: statusPickerPos.top,
                                    left: statusPickerPos.left,
                                    zIndex: 9999,
                                    background: '#0d1526',
                                    border: '1px solid rgba(148,170,255,0.2)',
                                    borderRadius: '0.5rem',
                                    padding: '0.375rem',
                                    minWidth: '220px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                  }}
                                >
                                  {STATUS_OPTIONS.map(option => (
                                    <button
                                      key={option}
                                      type="button"
                                      className="dj-status-option"
                                      onClick={() => statusMut.mutate({ id: e.id, status: option, event: e })}
                                      style={{
                                        display: 'flex',
                                        width: '100%',
                                        padding: '0.5rem 0.75rem',
                                        border: 'none',
                                        background: option === e.status ? 'rgba(255,255,255,0.06)' : 'transparent',
                                        cursor: 'pointer',
                                        borderRadius: '0.375rem',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                      }}
                                    >
                                      <StatusBadge status={option} />
                                      {option === e.status && (
                                        <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', color: 'var(--color-primary)', marginLeft: 'auto' }}>
                                          check
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Spalte 7: Eingang */}
                          <td
                            style={{ ...tdStyle, whiteSpace: 'nowrap' }}
                            title={new Date(e.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          >
                            {formatDate(e.created_at)}
                          </td>

                          {/* Spalte 8: Aktionen */}
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                              {/* Vorgespräch-Button */}
                              <div data-vorg-menu={menuOpenId === e.id ? 'open' : undefined} style={{ position: 'relative' }}>
                                <button
                                  type="button"
                                  className="dj-edit-btn"
                                  title={hasVorg ? 'Vorgespräch offen' : 'Vorgespräch'}
                                  onClick={(evt) => {
                                    if (menuOpenId === e.id) {
                                      setMenuOpenId(null);
                                      setMenuPos(null);
                                    } else {
                                      const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                                      setMenuPos({ top: rect.bottom + 4, left: rect.right - 200 });
                                      setMenuOpenId(e.id);
                                    }
                                  }}
                                  style={{
                                    background: hasVorg ? 'rgba(255,196,87,0.15)' : 'rgba(255,255,255,0.06)',
                                    border: hasVorg ? '1px solid rgba(255,196,87,0.4)' : '1px solid rgba(148,170,255,0.15)',
                                    borderRadius: '0.375rem',
                                    padding: '0.375rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: hasVorg ? '#ffc457' : 'var(--color-on-surface-variant)' }}>
                                    forum
                                  </span>
                                </button>

                                {/* 3-Punkt-Dropdown */}
                                {menuOpenId === e.id && menuPos && (
                                  <div
                                    data-vorg-menu="dropdown"
                                    style={{
                                      position: 'fixed',
                                      top: menuPos.top,
                                      left: menuPos.left,
                                      zIndex: 9999,
                                      background: '#0d1526',
                                      border: '1px solid rgba(148,170,255,0.2)',
                                      borderRadius: '0.5rem',
                                      padding: '0.375rem',
                                      minWidth: '200px',
                                      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="dj-vorg-menu-item"
                                      onClick={() => openVorgDialog(e)}
                                      style={{
                                        display: 'flex',
                                        width: '100%',
                                        padding: '0.5rem 0.75rem',
                                        border: 'none',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        borderRadius: '0.375rem',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: 'var(--color-on-surface)',
                                        fontFamily: 'var(--font-body)',
                                        fontSize: '0.875rem',
                                        textAlign: 'left',
                                      }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#ffc457' }}>
                                        {hasVorg ? 'edit_calendar' : 'calendar_add_on'}
                                      </span>
                                      {hasVorg ? 'Vorgespräch bearbeiten' : 'Vorgespräch planen'}
                                    </button>

                                    {hasVorg && (
                                      <button
                                        type="button"
                                        className="dj-vorg-menu-item"
                                        onClick={() => {
                                          setVorgKm('');
                                          setVorgErledigtEvent(e);
                                          setMenuOpenId(null);
                                          setMenuPos(null);
                                        }}
                                        style={{
                                          display: 'flex',
                                          width: '100%',
                                          padding: '0.5rem 0.75rem',
                                          border: 'none',
                                          background: 'transparent',
                                          cursor: 'pointer',
                                          borderRadius: '0.375rem',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                          color: 'var(--color-on-surface)',
                                          fontFamily: 'var(--font-body)',
                                          fontSize: '0.875rem',
                                          textAlign: 'left',
                                        }}
                                      >
                                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-secondary)' }}>
                                          check_circle
                                        </span>
                                        Als erledigt markieren
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Bearbeiten */}
                              <button
                                type="button"
                                className="dj-edit-btn"
                                title="Bearbeiten"
                                onClick={() => setSelectedEventId(e.id)}
                                style={{
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid rgba(148,170,255,0.15)',
                                  borderRadius: '0.375rem',
                                  padding: '0.375rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
                                  edit_note
                                </span>
                              </button>

                              {/* Löschen */}
                              <button
                                type="button"
                                className="dj-edit-btn"
                                title="Löschen"
                                onClick={async () => {
                                  if (!window.confirm(`Event "${e.title || EVENT_TYPE_LABELS[e.event_type]}" wirklich löschen?`)) return;
                                  if (e.calendar_uid) {
                                    await apiClient.delete(`/calendar/events/${encodeURIComponent(e.calendar_uid)}`).catch(() => {});
                                  }
                                  deleteMut.mutate(e.id);
                                }}
                                style={{
                                  background: 'rgba(255,110,132,0.08)',
                                  border: '1px solid rgba(255,110,132,0.2)',
                                  borderRadius: '0.375rem',
                                  padding: '0.375rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#ff6e84' }}>
                                  delete
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

        </div>{/* /content-wrapper */}
      </div>

      {/* ── Toasts ─────────────────────────────────────────────────── */}
      {calToast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 10500,
          background: 'rgba(92,253,128,0.12)', border: '1px solid #5cfd80',
          borderRadius: '0.75rem', padding: '0.875rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          boxShadow: '0 0 24px rgba(92,253,128,0.25)',
          fontFamily: 'var(--font-body)', fontSize: '0.875rem',
          color: 'var(--color-secondary)', maxWidth: '380px',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#5cfd80', flexShrink: 0 }}>
            calendar_add_on
          </span>
          {calToast}
        </div>
      )}

      {calError && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 10500,
          background: 'rgba(255,110,132,0.12)', border: '1px solid rgba(255,110,132,0.6)',
          borderRadius: '0.75rem', padding: '0.875rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          boxShadow: '0 0 24px rgba(255,110,132,0.2)',
          fontFamily: 'var(--font-body)', fontSize: '0.875rem',
          color: '#ff6e84', maxWidth: '420px',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#ff6e84', flexShrink: 0 }}>
            calendar_today
          </span>
          {calError}
        </div>
      )}

      {/* ── Vorgespräch-Dialog (planen / bearbeiten) ──────────────── */}
      {vorgDialogEvent && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }} onClick={(evt) => { if (evt.target === evt.currentTarget) { setVorgDialogEvent(null); setIsSaving(false); } }}>
          <div style={{
            background: '#0d1526',
            border: '1px solid rgba(148,170,255,0.2)',
            borderRadius: '1rem',
            padding: '2rem',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          }}>
            <h2 style={{
              fontFamily: 'var(--font-headline)', fontWeight: 700,
              fontSize: '1.25rem', color: 'var(--color-on-surface)',
              margin: 0, marginBottom: '0.375rem',
            }}>
              {vorgDialogEvent.vorgespraech_status === 'offen' ? 'Vorgespräch bearbeiten' : 'Vorgespräch planen'}
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '1.5rem' }}>
              {vorgDialogEvent.customer_name || vorgDialogEvent.customer_org || `Event #${vorgDialogEvent.id}`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Datum + Uhrzeit nebeneinander */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '0.375rem' }}>
                    Datum
                  </label>
                  <input
                    type="date"
                    value={vorgDatum}
                    onChange={ev => setVorgDatum(ev.target.value)}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(148,170,255,0.2)', borderRadius: '0.5rem',
                      padding: '0.625rem 0.875rem', color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
                      boxSizing: 'border-box', colorScheme: 'dark',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '0.375rem' }}>
                    Uhrzeit
                  </label>
                  <input
                    type="time"
                    value={vorgUhrzeit}
                    onChange={ev => setVorgUhrzeit(ev.target.value)}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(148,170,255,0.2)', borderRadius: '0.5rem',
                      padding: '0.625rem 0.875rem', color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
                      boxSizing: 'border-box', colorScheme: 'dark',
                    }}
                  />
                </div>
              </div>

              {/* PLZ + Ort nebeneinander */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '0.375rem' }}>
                    PLZ
                  </label>
                  <input
                    type="text"
                    value={vorgPlz}
                    onChange={ev => setVorgPlz(ev.target.value)}
                    placeholder="12345"
                    maxLength={10}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(148,170,255,0.2)', borderRadius: '0.5rem',
                      padding: '0.625rem 0.875rem', color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '0.375rem' }}>
                    Ort
                  </label>
                  <input
                    type="text"
                    value={vorgOrt}
                    onChange={ev => setVorgOrt(ev.target.value)}
                    placeholder="z.B. Café Muster, Videocall, …"
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(148,170,255,0.2)', borderRadius: '0.5rem',
                      padding: '0.625rem 0.875rem', color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Notizen */}
              <div>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '0.375rem' }}>
                  Notizen
                </label>
                <textarea
                  value={vorgNotizen}
                  onChange={ev => setVorgNotizen(ev.target.value)}
                  rows={3}
                  placeholder="Themen, Fragen, Anmerkungen…"
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(148,170,255,0.2)', borderRadius: '0.5rem',
                    padding: '0.625rem 0.875rem', color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {vorgDatum && djCalendarId && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'rgba(255,196,87,0.8)', marginTop: '0.875rem', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>event</span>
                Wird im Kalender eingetragen.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => { setVorgDialogEvent(null); setIsSaving(false); }}
                style={{
                  background: 'transparent', border: '1px solid rgba(148,170,255,0.2)',
                  borderRadius: '0.5rem', padding: '0.625rem 1.25rem',
                  color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem', cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveVorgespraech()}
                style={{
                  background: 'rgba(255,196,87,0.15)', border: '1px solid rgba(255,196,87,0.5)',
                  borderRadius: '0.5rem', padding: '0.625rem 1.25rem',
                  color: '#ffc457', fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem', fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                {isSaving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vorgespräch-Erledigt-Dialog ───────────────────────────── */}
      {vorgErledigtEvent && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }} onClick={(evt) => { if (evt.target === evt.currentTarget) setVorgErledigtEvent(null); }}>
          <div style={{
            background: '#0d1526',
            border: '1px solid rgba(92,253,128,0.2)',
            borderRadius: '1rem',
            padding: '2rem',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          }}>
            <h2 style={{
              fontFamily: 'var(--font-headline)', fontWeight: 700,
              fontSize: '1.25rem', color: 'var(--color-on-surface)',
              margin: 0, marginBottom: '0.375rem',
            }}>
              Vorgespräch erledigt
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '1.5rem' }}>
              {vorgErledigtEvent.customer_name || vorgErledigtEvent.customer_org || `Event #${vorgErledigtEvent.id}`}
            </p>

            <div>
              <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '0.375rem' }}>
                Gefahrene Kilometer (optional)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={vorgKm}
                onChange={ev => setVorgKm(ev.target.value)}
                placeholder="z.B. 42"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(148,170,255,0.2)', borderRadius: '0.5rem',
                  padding: '0.625rem 0.875rem', color: 'var(--color-on-surface)',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {vorgKm && Number(vorgKm) > 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-secondary)', marginTop: '0.5rem', marginBottom: 0 }}>
                  → {(Math.round(Number(vorgKm)) * 0.30).toFixed(2)} € Fahrtkosten werden als Ausgabe eingetragen.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setVorgErledigtEvent(null)}
                style={{
                  background: 'transparent', border: '1px solid rgba(148,170,255,0.2)',
                  borderRadius: '0.5rem', padding: '0.625rem 1.25rem',
                  color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem', cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={vorgMut.isPending}
                onClick={() => {
                  vorgMut.mutate({
                    id: vorgErledigtEvent.id,
                    data: {
                      action: 'erledigt',
                      km: vorgKm ? Number(vorgKm) : undefined,
                    },
                  });
                }}
                style={{
                  background: 'rgba(92,253,128,0.12)', border: '1px solid rgba(92,253,128,0.4)',
                  borderRadius: '0.5rem', padding: '0.625rem 1.25rem',
                  color: '#5cfd80', fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                  opacity: vorgMut.isPending ? 0.6 : 1,
                }}
              >
                {vorgMut.isPending ? 'Speichern…' : 'Als erledigt markieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Event-Modals ─────────────────────────────────────────── */}
      {showNeueAnfrage && !selectedEventId && (
        <NeueAnfrageModal
          key="create"
          onClose={() => setShowNeueAnfrage(false)}
          onCreated={() => {
            setShowNeueAnfrage(false);
            queryClient.invalidateQueries({ queryKey: ['dj-events'] });
          }}
        />
      )}

      {selectedEventId != null && (
        <NeueAnfrageModal
          key={`edit-${selectedEventId}`}
          eventId={selectedEventId}
          onClose={() => setSelectedEventId(null)}
          onCreated={() => setSelectedEventId(null)}
          onUpdated={() => {
            setSelectedEventId(null);
            queryClient.invalidateQueries({ queryKey: ['dj-events'] });
          }}
        />
      )}
    </PageWrapper>
  );
}
