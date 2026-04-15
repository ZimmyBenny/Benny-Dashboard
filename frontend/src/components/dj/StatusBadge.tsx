type EventStatus = 'anfrage' | 'neu' | 'vorgespraech_vereinbart' | 'angebot_gesendet' | 'bestaetigt' | 'abgeschlossen' | 'abgesagt';
type QuoteStatus = 'entwurf' | 'gesendet' | 'angenommen' | 'abgelehnt' | 'abgelaufen';
type InvoiceStatus = 'entwurf' | 'offen' | 'teilbezahlt' | 'bezahlt' | 'ueberfaellig' | 'storniert';

type AnyStatus = EventStatus | QuoteStatus | InvoiceStatus;

const STATUS_CONFIG: Record<AnyStatus, { label: string; bg: string; text: string; extra?: string; dot?: string }> = {
  // Event-Status
  anfrage:                   { label: 'Anfrage',                bg: 'rgba(148,170,255,0.12)',          text: 'var(--color-primary)',            dot: '#94aaff' },
  neu:                       { label: 'Neu',                    bg: 'var(--color-outline-variant-20)', text: 'var(--color-on-surface-variant)', dot: '#94aaff' },
  vorgespraech_vereinbart:   { label: 'Vorgespräch vereinbart', bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)',            dot: '#94aaff' },
  angebot_gesendet:          { label: 'Angebot gesendet',       bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)',            dot: '#94aaff' },
  bestaetigt:                { label: 'Bestätigt',              bg: 'rgba(166,140,255,0.15)',          text: 'var(--color-tertiary)',           dot: '#5cfd80' },
  abgeschlossen:             { label: 'Abgeschlossen',          bg: 'rgba(92,253,128,0.15)',           text: 'var(--color-secondary)',          dot: 'rgba(92,253,128,0.5)' },
  abgesagt:                  { label: 'Abgesagt',               bg: 'rgba(255,110,132,0.15)',          text: 'var(--color-error)',              dot: '#ff6e84' },
  // Quote-Status
  entwurf:                   { label: 'Entwurf',                bg: 'rgba(109,117,140,0.2)',           text: 'var(--color-on-surface-variant)', dot: 'rgba(109,117,140,0.6)' },
  gesendet:                  { label: 'Gesendet',               bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)',            dot: '#94aaff' },
  angenommen:                { label: 'Angenommen',             bg: 'rgba(92,253,128,0.15)',           text: 'var(--color-secondary)',          dot: '#5cfd80' },
  abgelehnt:                 { label: 'Abgelehnt',              bg: 'rgba(167,1,56,0.4)',              text: 'var(--color-on-surface)',         dot: '#ff6e84' },
  abgelaufen:                { label: 'Abgelaufen',             bg: 'rgba(109,117,140,0.2)',           text: 'var(--color-on-surface-variant)', dot: 'rgba(109,117,140,0.5)' },
  // Invoice-Status
  offen:                     { label: 'Offen',                  bg: 'rgba(148,170,255,0.15)',          text: 'var(--color-primary)',            dot: '#94aaff' },
  teilbezahlt:               { label: 'Teilbezahlt',            bg: 'rgba(166,140,255,0.15)',          text: 'var(--color-tertiary)',           dot: '#a68cff' },
  bezahlt:                   { label: 'Bezahlt',                bg: 'rgba(92,253,128,0.15)',           text: 'var(--color-secondary)',          dot: '#5cfd80' },
  ueberfaellig:              { label: 'Überfällig',             bg: 'rgba(255,110,132,0.15)',          text: 'var(--color-error)',              dot: '#ff6e84' },
  storniert:                 { label: 'Storniert',              bg: 'rgba(109,117,140,0.3)',           text: 'var(--color-outline)', extra: 'line-through', dot: 'rgba(109,117,140,0.5)' },
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'rgba(109,117,140,0.2)', text: 'var(--color-on-surface-variant)' };
  const glowColor = cfg.dot ?? cfg.text;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      padding: '0.2rem 0.75rem',
      fontSize: '0.7rem',
      fontWeight: 700,
      fontFamily: 'var(--font-body)',
      background: cfg.bg,
      color: cfg.text,
      textDecoration: cfg.extra,
      whiteSpace: 'nowrap',
      border: `1px solid ${glowColor}`,
      boxShadow: `0 0 8px 1px ${glowColor}40, inset 0 0 8px 0px ${glowColor}18`,
      letterSpacing: '0.03em',
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
  festival:     'Polterabend',
  sonstige:     'Sonstiges',
};
