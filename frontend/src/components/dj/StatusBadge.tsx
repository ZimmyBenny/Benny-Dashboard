type EventStatus = 'neu' | 'vorgespraech_vereinbart' | 'angebot_gesendet' | 'bestaetigt' | 'abgeschlossen' | 'abgesagt';
type QuoteStatus = 'entwurf' | 'gesendet' | 'angenommen' | 'abgelehnt' | 'abgelaufen';
type InvoiceStatus = 'entwurf' | 'offen' | 'teilbezahlt' | 'bezahlt' | 'ueberfaellig' | 'storniert';

type AnyStatus = EventStatus | QuoteStatus | InvoiceStatus;

const STATUS_CONFIG: Record<AnyStatus, { label: string; bg: string; text: string; extra?: string }> = {
  // Event-Status
  neu:                       { label: 'Neu',                    bg: 'var(--color-outline-variant-20)', text: 'var(--color-on-surface-variant)' },
  vorgespraech_vereinbart:   { label: 'Vorgespräch vereinbart', bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)' },
  angebot_gesendet:          { label: 'Angebot gesendet',       bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)' },
  bestaetigt:                { label: 'Bestätigt',              bg: 'rgba(166,140,255,0.15)',          text: 'var(--color-tertiary)' },
  abgeschlossen:             { label: 'Abgeschlossen',          bg: 'rgba(92,253,128,0.15)',           text: 'var(--color-secondary)' },
  abgesagt:                  { label: 'Abgesagt',               bg: 'rgba(255,110,132,0.15)',          text: 'var(--color-error)' },
  // Quote-Status
  entwurf:                   { label: 'Entwurf',                bg: 'rgba(109,117,140,0.2)',           text: 'var(--color-on-surface-variant)' },
  gesendet:                  { label: 'Gesendet',               bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)' },
  angenommen:                { label: 'Angenommen',             bg: 'rgba(92,253,128,0.15)',           text: 'var(--color-secondary)' },
  abgelehnt:                 { label: 'Abgelehnt',              bg: 'rgba(167,1,56,0.4)',              text: 'var(--color-on-surface)' },
  abgelaufen:                { label: 'Abgelaufen',             bg: 'rgba(109,117,140,0.2)',           text: 'var(--color-on-surface-variant)' },
  // Invoice-Status
  offen:                     { label: 'Offen',                  bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)' },
  teilbezahlt:               { label: 'Teilbezahlt',            bg: 'rgba(166,140,255,0.15)',          text: 'var(--color-tertiary)' },
  bezahlt:                   { label: 'Bezahlt',                bg: 'rgba(92,253,128,0.15)',           text: 'var(--color-secondary)' },
  ueberfaellig:              { label: 'Überfällig',             bg: 'rgba(255,110,132,0.15)',          text: 'var(--color-error)' },
  storniert:                 { label: 'Storniert',              bg: 'rgba(109,117,140,0.3)',           text: 'var(--color-outline)', extra: 'line-through' },
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'rgba(109,117,140,0.2)', text: 'var(--color-on-surface-variant)' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      padding: '0.2rem 0.625rem',
      fontSize: '0.7rem',
      fontWeight: 600,
      fontFamily: 'var(--font-body)',
      background: cfg.bg,
      color: cfg.text,
      textDecoration: cfg.extra,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  hochzeit:     'Hochzeit',
  firmen_event: 'Firmen-Event',
  club_bar:     'Club / Bar',
  geburtstag:   'Geburtstag',
  festival:     'Festival',
  sonstige:     'Sonstiges',
};
