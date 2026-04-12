import { useEffect, useRef, useState } from 'react';
import { fetchContacts, type Contact } from '../../api/contacts.api';

interface ContactPickerProps {
  contactId: number | null;
  contactName: string | null;
  onChange: (contactId: number | null, displayName: string | null) => void;
}

function getDisplayName(c: Contact): string {
  if (c.contact_kind === 'organization' && c.organization_name) return c.organization_name;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '(kein Name)';
}

export function ContactPicker({ contactId, contactName, onChange }: ContactPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced contact search
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      fetchContacts({ search, limit: 20 })
        .then((res) => setContacts(res.data))
        .catch(() => setContacts([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleBadgeClick() {
    setOpen((v) => !v);
    if (!open) setSearch('');
  }

  function handleSelect(contact: Contact) {
    onChange(contact.id, getDisplayName(contact));
    setOpen(false);
    setSearch('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null, null);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Badge */}
      <span
        onClick={handleBadgeClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.2rem 0.6rem',
          borderRadius: '999px',
          fontSize: '0.78rem',
          background: contactId ? 'rgba(204,151,255,0.12)' : 'var(--color-surface-container)',
          border: `1px solid ${contactId ? 'rgba(204,151,255,0.35)' : 'var(--color-outline-variant)'}`,
          cursor: 'pointer',
          color: contactId ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
          userSelect: 'none',
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>person</span>
        <span>{contactId && contactName ? contactName : 'Kein Kontakt'}</span>
        {contactId && (
          <span
            onClick={handleClear}
            className="material-symbols-outlined"
            style={{ fontSize: '0.85rem', marginLeft: '0.1rem', color: 'var(--color-on-surface-variant)', lineHeight: 1 }}
          >
            close
          </span>
        )}
      </span>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 10,
            width: '280px',
            background: 'var(--color-surface-container-high)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kontakt suchen..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Contact list */}
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                Laden...
              </div>
            )}
            {!loading && contacts.length === 0 && (
              <div style={{ padding: '0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                Keine Kontakte gefunden
              </div>
            )}
            {contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.1rem',
                  padding: '0.5rem 0.75rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--color-outline-variant)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(204,151,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                  {getDisplayName(c)}
                </span>
                {c.organization_name && c.contact_kind === 'person' && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>
                    {c.organization_name}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
