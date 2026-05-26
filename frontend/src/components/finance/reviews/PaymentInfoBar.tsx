import { useEffect, useState } from 'react';

const STORAGE_KEY_PAYPAL = 'finance.bewertungen.paypal';
const STORAGE_KEY_IBAN   = 'finance.bewertungen.iban';

interface FieldProps {
  label: string;
  icon: string;
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}

function PaymentField({ label, icon, value, placeholder, onSave }: FieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  function handleCopy() {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  function handleSave() {
    onSave(draft.trim());
    setEditing(false);
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flex: '1 1 280px',
      minWidth: 0,
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '0.625rem',
      padding: '0.5rem 0.75rem',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#94aaff', flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-on-surface-variant)',
        flexShrink: 0,
      }}>
        {label}
      </span>
      {editing ? (
        <input
          type="text"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-outline)',
            borderRadius: '0.375rem',
            padding: '0.25rem 0.5rem',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: value ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
            fontStyle: value ? 'normal' : 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
          title="Klicken zum Bearbeiten"
        >
          {value || placeholder}
        </span>
      )}
      <button
        onClick={handleCopy}
        disabled={!value}
        title={value ? 'In Zwischenablage kopieren' : 'Erst Wert eintragen'}
        style={{
          background: copied ? 'rgba(92,253,128,0.18)' : 'transparent',
          border: `1px solid ${copied ? 'rgba(92,253,128,0.4)' : 'rgba(148,170,255,0.25)'}`,
          color: copied ? '#5cfd80' : '#94aaff',
          borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem',
          fontSize: '0.7rem',
          fontWeight: 600,
          cursor: value ? 'pointer' : 'not-allowed',
          opacity: value ? 1 : 0.4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{copied ? 'check' : 'content_copy'}</span>
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
      <button
        onClick={() => setEditing(true)}
        title="Bearbeiten"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-on-surface-variant)',
          cursor: 'pointer',
          padding: '0.25rem',
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
      </button>
    </div>
  );
}

export function PaymentInfoBar() {
  const [paypal, setPaypal] = useState(() => localStorage.getItem(STORAGE_KEY_PAYPAL) ?? '');
  const [iban,   setIban]   = useState(() => localStorage.getItem(STORAGE_KEY_IBAN)   ?? '');

  function savePaypal(v: string) {
    setPaypal(v);
    if (v) localStorage.setItem(STORAGE_KEY_PAYPAL, v);
    else localStorage.removeItem(STORAGE_KEY_PAYPAL);
  }
  function saveIban(v: string) {
    setIban(v);
    if (v) localStorage.setItem(STORAGE_KEY_IBAN, v);
    else localStorage.removeItem(STORAGE_KEY_IBAN);
  }

  return (
    <div style={{
      display: 'flex',
      gap: '0.625rem',
      flexWrap: 'wrap',
      marginBottom: '1rem',
    }}>
      <PaymentField
        label="PayPal"
        icon="account_balance_wallet"
        value={paypal}
        placeholder="z.B. paypal@beispiel.de"
        onSave={savePaypal}
      />
      <PaymentField
        label="IBAN"
        icon="credit_card"
        value={iban}
        placeholder="z.B. DE12 3456 7890 1234 5678 90"
        onSave={saveIban}
      />
    </div>
  );
}
