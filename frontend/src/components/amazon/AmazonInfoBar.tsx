import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEurUsdRate } from '../../api/amazon.api';

/**
 * AmazonInfoBar — Info-Zeile fürs Amazon-Dashboard:
 * Deutschland-Zeit, China-Zeit (UTC+8) und aktueller EUR/USD-Wechselkurs.
 * Uhren live via setInterval (1s), FX via GET /api/amazon/fx/eur-usd (5-Min-Cache).
 */
function fmtTime(d: Date, tz: string): string {
  return d.toLocaleTimeString('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(d: Date, tz: string): string {
  return d.toLocaleDateString('de-DE', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
}

const CARD: React.CSSProperties = { padding: '1.25rem 1.5rem' };
const INNER: React.CSSProperties = { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' };
const LABEL: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--color-on-surface-variant)',
};
const VALUE: React.CSSProperties = {
  fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.7rem', lineHeight: 1.05,
  color: 'var(--color-on-surface)', fontVariantNumeric: 'tabular-nums',
};
const SUB: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-outline)' };

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" style={{ fontSize: '1.05rem', color: 'var(--color-primary)' }}>{name}</span>;
}

export function AmazonInfoBar() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fx = useQuery({
    queryKey: ['amazon', 'eur-usd'],
    queryFn: fetchEurUsdRate,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const fxValue = fx.isLoading ? '…' : fx.isError || !fx.data ? 'n/v' : fx.data.rate.toFixed(4);
  const fxSub = fx.data?.date ? `Stand ${fx.data.date}` : 'EUR → USD';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '0.5rem' }}>
      <div className="module-card" style={CARD}>
        <div style={INNER}>
          <div style={LABEL}><Icon name="schedule" /> Deutschland</div>
          <div style={VALUE}>{fmtTime(now, 'Europe/Berlin')}</div>
          <div style={SUB}>{fmtDate(now, 'Europe/Berlin')}</div>
        </div>
      </div>

      <div className="module-card" style={CARD}>
        <div style={INNER}>
          <div style={LABEL}><Icon name="public" /> China (UTC+8)</div>
          <div style={VALUE}>{fmtTime(now, 'Asia/Shanghai')}</div>
          <div style={SUB}>{fmtDate(now, 'Asia/Shanghai')}</div>
        </div>
      </div>

      <div className="module-card" style={CARD}>
        <div style={INNER}>
          <div style={LABEL}><Icon name="currency_exchange" /> EUR/USD Wechselkurs</div>
          <div style={VALUE}>{fxValue}</div>
          <div style={SUB}>{fxSub}</div>
        </div>
      </div>
    </div>
  );
}
