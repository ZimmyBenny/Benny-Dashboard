import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchContact,
  fetchNextNumber,
  createContact,
  updateContact,
  type ContactDetail,
  type ContactAddress,
  type ContactEmail,
  type ContactPhone,
  type ContactWebsite,
} from '../api/contacts.api';

// ---------------------------------------------------------------------------
// Typen fuer Formular-State
// ---------------------------------------------------------------------------
type FormAddress = Omit<ContactAddress, 'id' | 'contact_id'> & { _key: string };
type FormEmail = Omit<ContactEmail, 'id' | 'contact_id'> & { _key: string };
type FormPhone = Omit<ContactPhone, 'id' | 'contact_id'> & { _key: string };
type FormWebsite = Omit<ContactWebsite, 'id' | 'contact_id'> & { _key: string };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyAddress(): FormAddress {
  return { _key: uid(), street: null, postal_code: null, city: null, country: 'Deutschland', label: 'Rechnungsanschrift', is_primary: 0, latitude: null, longitude: null };
}
function emptyEmail(): FormEmail {
  return { _key: uid(), email: '', label: 'Arbeit', is_primary: 0 };
}
function emptyPhone(): FormPhone {
  return { _key: uid(), phone: '', label: 'Arbeit', is_primary: 0 };
}
function emptyWebsite(): FormWebsite {
  return { _key: uid(), url: '', label: 'Webseite', is_primary: 0 };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.8rem',
  color: 'var(--color-on-surface-variant)',
  marginBottom: '0.25rem',
  display: 'block',
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.7rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--color-outline)',
  marginBottom: '0.875rem',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: '0.5rem',
  padding: '1rem 1.25rem',
  marginBottom: '0.875rem',
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

const btnAdd: React.CSSProperties = {
  ...btnSecondary,
  color: 'var(--color-primary)',
  borderColor: 'rgba(204,151,255,0.3)',
  marginTop: '0.5rem',
};

const btnDangerSmall: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#f87171',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.2rem',
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen: Formular-Felder
// ---------------------------------------------------------------------------
function InputField({ label, value, onChange, placeholder, type = 'text', readOnly = false }: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{ ...inputStyle, opacity: readOnly ? 0.6 : 1, cursor: readOnly ? 'default' : 'text' }}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContactFormPage
// ---------------------------------------------------------------------------
export function ContactFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'stamm' | 'adresse' | 'kontakt' | 'zahlung' | 'sonstiges'>('stamm');
  const [contactKind, setContactKind] = useState<'person' | 'organization'>('person');

  // Stammdaten
  const [customerNumber, setCustomerNumber] = useState('');
  const [salutation, setSalutation] = useState('');
  const [title, setTitle] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [position, setPosition] = useState('');
  const [contactType, setContactType] = useState('Sonstiges');
  const [area, setArea] = useState('Sonstiges');

  // Subtabellen
  const [addresses, setAddresses] = useState<FormAddress[]>([emptyAddress()]);
  const [emails, setEmails] = useState<FormEmail[]>([emptyEmail()]);
  const [phones, setPhones] = useState<FormPhone[]>([emptyPhone()]);
  const [websites, setWebsites] = useState<FormWebsite[]>([]);

  // Zahlung & Konditionen
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [vatId, setVatId] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [debtorNumber, setDebtorNumber] = useState('');
  const [creditorNumber, setCreditorNumber] = useState('');
  const [discountDays, setDiscountDays] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [paymentTermDays, setPaymentTermDays] = useState('');
  const [customerDiscount, setCustomerDiscount] = useState('');
  const [eInvoice, setEInvoice] = useState(false);

  // Sonstiges
  const [birthday, setBirthday] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  // Daten laden
  useEffect(() => {
    if (isEdit && id) {
      fetchContact(Number(id)).then(c => {
        setContactKind(c.contact_kind);
        setCustomerNumber(c.customer_number ?? '');
        setSalutation(c.salutation ?? '');
        setTitle(c.title ?? '');
        setFirstName(c.first_name ?? '');
        setLastName(c.last_name ?? '');
        setOrganizationName(c.organization_name ?? '');
        setSuffix(c.suffix ?? '');
        setPosition(c.position ?? '');
        setContactType(c.type);
        setArea(c.area);
        setIban(c.iban ?? '');
        setBic(c.bic ?? '');
        setVatId(c.vat_id ?? '');
        setTaxNumber(c.tax_number ?? '');
        setDebtorNumber(c.debtor_number ?? '');
        setCreditorNumber(c.creditor_number ?? '');
        setDiscountDays(c.discount_days != null ? String(c.discount_days) : '');
        setDiscountPercent(c.discount_percent != null ? String(c.discount_percent) : '');
        setPaymentTermDays(c.payment_term_days != null ? String(c.payment_term_days) : '');
        setCustomerDiscount(c.customer_discount != null ? String(c.customer_discount) : '');
        setEInvoice(c.e_invoice_default === 1);
        setBirthday(c.birthday ?? '');
        setDescription(c.description ?? '');
        setTags(c.tags ?? '');

        setAddresses(c.addresses.length > 0
          ? c.addresses.map(a => ({ _key: uid(), ...a }))
          : [emptyAddress()]);
        setEmails(c.emails.length > 0
          ? c.emails.map(e => ({ _key: uid(), ...e }))
          : [emptyEmail()]);
        setPhones(c.phones.length > 0
          ? c.phones.map(p => ({ _key: uid(), ...p }))
          : [emptyPhone()]);
        setWebsites(c.websites.map(w => ({ _key: uid(), ...w })));

        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      // Neue Kundennummer vorladen
      fetchNextNumber().then(n => setCustomerNumber(n)).catch(() => {});
    }
  }, [id, isEdit]);

  // ---------------------------------------------------------------------------
  // Speichern
  // ---------------------------------------------------------------------------
  async function handleSave() {
    setError(null);
    // Validierung
    if (contactKind === 'person' && !firstName.trim() && !lastName.trim()) {
      setError('Vorname oder Nachname ist bei einer Person erforderlich.');
      setActiveTab('stamm');
      return;
    }
    if (contactKind === 'organization' && !organizationName.trim()) {
      setError('Organisationsname ist erforderlich.');
      setActiveTab('stamm');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<ContactDetail> = {
        contact_kind: contactKind,
        type: contactType,
        area,
        customer_number: customerNumber || undefined,
        salutation: salutation || null,
        title: title || null,
        first_name: firstName || null,
        last_name: lastName || null,
        suffix: suffix || null,
        organization_name: organizationName || null,
        position: position || null,
        iban: iban || null,
        bic: bic || null,
        vat_id: vatId || null,
        tax_number: taxNumber || null,
        debtor_number: debtorNumber || null,
        creditor_number: creditorNumber || null,
        discount_days: discountDays ? parseInt(discountDays, 10) : null,
        discount_percent: discountPercent ? parseFloat(discountPercent) : null,
        payment_term_days: paymentTermDays ? parseInt(paymentTermDays, 10) : null,
        customer_discount: customerDiscount ? parseFloat(customerDiscount) : null,
        e_invoice_default: eInvoice ? 1 : 0,
        birthday: birthday || null,
        description: description || null,
        tags: tags || null,
        addresses: addresses.filter(a => a.street || a.city || a.postal_code),
        emails: emails.filter(e => e.email.trim()),
        phones: phones.filter(p => p.phone.trim()),
        websites: websites.filter(w => w.url.trim()),
      };

      let result: ContactDetail;
      if (isEdit && id) {
        result = await updateContact(Number(id), payload);
      } else {
        result = await createContact(payload);
      }
      navigate(`/contacts/${result.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ? `Fehler: ${msg}` : 'Speichern fehlgeschlagen. Bitte prüfen und erneut versuchen.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <PageWrapper>
        <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', padding: '3rem 0', textAlign: 'center' }}>
          Lade...
        </div>
      </PageWrapper>
    );
  }

  const backPath = isEdit ? `/contacts/${id}` : '/contacts';

  return (
    <PageWrapper>
      {/* Zurueck */}
      <Link to={backPath} style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)',
        fontSize: '0.85rem', textDecoration: 'none', marginBottom: '1.25rem',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_back</span>
        Abbrechen
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>
          {isEdit ? 'edit' : 'person_add'}
        </span>
        <h1 style={{
          fontFamily: 'var(--font-headline)', fontWeight: 800,
          fontSize: 'clamp(1.3rem, 3vw, 1.75rem)', letterSpacing: '-0.02em',
          color: 'var(--color-on-surface)', margin: 0,
        }}>
          {isEdit ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
        </h1>
      </div>

      {/* Toggle Person / Organisation */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', border: '1px solid var(--color-outline-variant)', borderRadius: '0.5rem', overflow: 'hidden', width: 'fit-content' }}>
        {(['person', 'organization'] as const).map(kind => (
          <button
            key={kind}
            onClick={() => setContactKind(kind)}
            style={{
              padding: '0.5rem 1.25rem',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 600,
              background: contactKind === kind
                ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))'
                : 'rgba(255,255,255,0.06)',
              color: contactKind === kind ? '#000' : 'var(--color-on-surface)',
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              {kind === 'person' ? 'person' : 'apartment'}
            </span>
            {kind === 'person' ? 'Person' : 'Organisation'}
          </button>
        ))}
      </div>

      {/* Fehler-Meldung */}
      {error && (
        <div style={{
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem',
          color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
        }}>
          {error}
        </div>
      )}

      {/* Tab-Bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
        {[
          { id: 'stamm' as const, label: 'Stammdaten', icon: 'badge' },
          { id: 'adresse' as const, label: 'Adresse', icon: 'location_on' },
          { id: 'kontakt' as const, label: 'Kontaktdetails', icon: 'contact_phone' },
          { id: 'zahlung' as const, label: 'Zahlung', icon: 'account_balance' },
          { id: 'sonstiges' as const, label: 'Sonstiges', icon: 'more_horiz' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.5rem 1rem', background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)', fontSize: '0.875rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              marginBottom: '-1px', transition: 'color 150ms ease, border-color 150ms ease',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Stammdaten */}
      {activeTab === 'stamm' && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Stammdaten</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            <InputField label="Kundennummer" value={customerNumber} readOnly />
            <SelectField label="Anrede" value={salutation} onChange={setSalutation} options={[
              { value: '', label: '—' },
              { value: 'Herr', label: 'Herr' },
              { value: 'Frau', label: 'Frau' },
              { value: 'Divers', label: 'Divers' },
            ]} />
            <InputField label="Titel" value={title} onChange={setTitle} placeholder="Dr., Prof., ..." />
            {contactKind === 'person' ? (
              <>
                <InputField label="Vorname *" value={firstName} onChange={setFirstName} placeholder="Vorname" />
                <InputField label="Nachname *" value={lastName} onChange={setLastName} placeholder="Nachname" />
                <InputField label="Organisation (optional)" value={organizationName} onChange={setOrganizationName} placeholder="Firmenname" />
              </>
            ) : (
              <>
                <InputField label="Organisationsname *" value={organizationName} onChange={setOrganizationName} placeholder="Firmenname" />
                <InputField label="Vorname (optional)" value={firstName} onChange={setFirstName} placeholder="Vorname" />
                <InputField label="Nachname (optional)" value={lastName} onChange={setLastName} placeholder="Nachname" />
              </>
            )}
            <InputField label="Namenszusatz" value={suffix} onChange={setSuffix} placeholder="z.B. GmbH, Ltd." />
            <InputField label="Position" value={position} onChange={setPosition} placeholder="Geschaeftsfuehrer, ..." />
            <SelectField label="Typ" value={contactType} onChange={setContactType} options={[
              { value: 'Kunde', label: 'Kunde' },
              { value: 'Lieferant', label: 'Lieferant' },
              { value: 'Partner', label: 'Partner' },
              { value: 'Interessent', label: 'Interessent' },
              { value: 'Sonstiges', label: 'Sonstiges' },
            ]} />
            <SelectField label="Bereich" value={area} onChange={setArea} options={[
              { value: 'DJ', label: 'DJ' },
              { value: 'Amazon', label: 'Amazon' },
              { value: 'Cashback', label: 'Cashback' },
              { value: 'Finanzen', label: 'Finanzen' },
              { value: 'Privat', label: 'Privat' },
              { value: 'Sonstiges', label: 'Sonstiges' },
            ]} />
          </div>
        </div>
      )}

      {/* Tab: Adresse */}
      {activeTab === 'adresse' && (
        <div>
          {addresses.map((addr, i) => (
            <div key={addr._key} style={{ ...cardStyle, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                <div style={sectionLabelStyle}>Adresse {i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                    <input
                      type="checkbox"
                      checked={addr.is_primary === 1}
                      onChange={e => {
                        const v = e.target.checked ? 1 : 0;
                        setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, is_primary: v } : a));
                      }}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    Primär
                  </label>
                  {addresses.length > 1 && (
                    <button style={btnDangerSmall} onClick={() => setAddresses(prev => prev.filter((_, idx) => idx !== i))}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                <InputField label="Strasse" value={addr.street ?? ''} onChange={v => setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, street: v || null } : a))} placeholder="Musterstrasse 1" />
                <InputField label="PLZ" value={addr.postal_code ?? ''} onChange={v => setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, postal_code: v || null } : a))} placeholder="12345" />
                <InputField label="Ort" value={addr.city ?? ''} onChange={v => setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, city: v || null } : a))} placeholder="Musterstadt" />
                <InputField label="Land" value={addr.country} onChange={v => setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, country: v } : a))} placeholder="Deutschland" />
                <InputField label="Label" value={addr.label} onChange={v => setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, label: v } : a))} placeholder="Rechnungsanschrift" />
                <InputField label="Latitude" value={addr.latitude != null ? String(addr.latitude) : ''} onChange={v => setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, latitude: v ? parseFloat(v) : null } : a))} placeholder="49.1981" />
                <InputField label="Longitude" value={addr.longitude != null ? String(addr.longitude) : ''} onChange={v => setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, longitude: v ? parseFloat(v) : null } : a))} placeholder="12.5228" />
              </div>
            </div>
          ))}
          <button style={btnAdd} onClick={() => setAddresses(prev => [...prev, emptyAddress()])}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
            Adresse hinzufügen
          </button>
        </div>
      )}

      {/* Tab: Kontaktdetails */}
      {activeTab === 'kontakt' && (
        <div>
          {/* E-Mails */}
          <div style={cardStyle}>
            <div style={sectionLabelStyle}>E-Mail-Adressen</div>
            {emails.map((email, i) => (
              <div key={email._key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 180px' }}>
                  <InputField label="E-Mail" value={email.email} onChange={v => setEmails(prev => prev.map((e, idx) => idx === i ? { ...e, email: v } : e))} placeholder="max@beispiel.de" />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <InputField label="Label" value={email.label} onChange={v => setEmails(prev => prev.map((e, idx) => idx === i ? { ...e, label: v } : e))} placeholder="Arbeit" />
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', paddingBottom: '0.625rem' }}>
                  <input type="checkbox" checked={email.is_primary === 1}
                    onChange={e => setEmails(prev => prev.map((em, idx) => idx === i ? { ...em, is_primary: e.target.checked ? 1 : 0 } : em))}
                    style={{ accentColor: 'var(--color-primary)' }} />
                  Primär
                </label>
                {emails.length > 1 && (
                  <button style={btnDangerSmall} onClick={() => setEmails(prev => prev.filter((_, idx) => idx !== i))}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
                  </button>
                )}
              </div>
            ))}
            <button style={btnAdd} onClick={() => setEmails(prev => [...prev, emptyEmail()])}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
              E-Mail hinzufügen
            </button>
          </div>

          {/* Telefone */}
          <div style={cardStyle}>
            <div style={sectionLabelStyle}>Telefonnummern</div>
            {phones.map((phone, i) => (
              <div key={phone._key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 180px' }}>
                  <InputField label="Telefon" value={phone.phone} onChange={v => setPhones(prev => prev.map((p, idx) => idx === i ? { ...p, phone: v } : p))} placeholder="+49 123 456789" />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <InputField label="Label" value={phone.label} onChange={v => setPhones(prev => prev.map((p, idx) => idx === i ? { ...p, label: v } : p))} placeholder="Arbeit" />
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', paddingBottom: '0.625rem' }}>
                  <input type="checkbox" checked={phone.is_primary === 1}
                    onChange={e => setPhones(prev => prev.map((p, idx) => idx === i ? { ...p, is_primary: e.target.checked ? 1 : 0 } : p))}
                    style={{ accentColor: 'var(--color-primary)' }} />
                  Primär
                </label>
                {phones.length > 1 && (
                  <button style={btnDangerSmall} onClick={() => setPhones(prev => prev.filter((_, idx) => idx !== i))}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
                  </button>
                )}
              </div>
            ))}
            <button style={btnAdd} onClick={() => setPhones(prev => [...prev, emptyPhone()])}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
              Telefon hinzufügen
            </button>
          </div>

          {/* Webseiten */}
          <div style={cardStyle}>
            <div style={sectionLabelStyle}>Webseiten</div>
            {websites.map((site, i) => (
              <div key={site._key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 220px' }}>
                  <InputField label="URL" value={site.url} onChange={v => setWebsites(prev => prev.map((w, idx) => idx === i ? { ...w, url: v } : w))} placeholder="https://beispiel.de" />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <InputField label="Label" value={site.label} onChange={v => setWebsites(prev => prev.map((w, idx) => idx === i ? { ...w, label: v } : w))} placeholder="Webseite" />
                </div>
                <button style={btnDangerSmall} onClick={() => setWebsites(prev => prev.filter((_, idx) => idx !== i))}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
                </button>
              </div>
            ))}
            <button style={btnAdd} onClick={() => setWebsites(prev => [...prev, emptyWebsite()])}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
              Webseite hinzufügen
            </button>
          </div>
        </div>
      )}

      {/* Tab: Zahlung & Konditionen */}
      {activeTab === 'zahlung' && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Zahlung & Konditionen</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            <InputField label="IBAN" value={iban} onChange={setIban} placeholder="DE00 0000 0000 0000 0000 00" />
            <InputField label="BIC" value={bic} onChange={setBic} placeholder="DEUTDEDB" />
            <InputField label="USt-ID" value={vatId} onChange={setVatId} placeholder="DE123456789" />
            <InputField label="Steuernummer" value={taxNumber} onChange={setTaxNumber} />
            <InputField label="Debitoren-Nr." value={debtorNumber} onChange={setDebtorNumber} />
            <InputField label="Kreditoren-Nr." value={creditorNumber} onChange={setCreditorNumber} />
            <InputField label="Skonto Tage" value={discountDays} onChange={setDiscountDays} type="number" placeholder="14" />
            <InputField label="Skonto %" value={discountPercent} onChange={setDiscountPercent} type="number" placeholder="2" />
            <InputField label="Zahlungsziel Tage" value={paymentTermDays} onChange={setPaymentTermDays} type="number" placeholder="30" />
            <InputField label="Kundenrabatt %" value={customerDiscount} onChange={setCustomerDiscount} type="number" placeholder="5" />
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', marginTop: '1rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            <input type="checkbox" checked={eInvoice} onChange={e => setEInvoice(e.target.checked)} style={{ accentColor: 'var(--color-primary)', width: '1rem', height: '1rem' }} />
            E-Rechnungs-Default aktivieren
          </label>
        </div>
      )}

      {/* Tab: Sonstiges */}
      {activeTab === 'sonstiges' && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Sonstiges</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <InputField label="Geburtstag" value={birthday} onChange={setBirthday} type="date" />
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Beschreibung</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Beschreibung, Notizen, ..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <InputField label="Tags (Komma-getrennt)" value={tags} onChange={setTags} placeholder="DJ, Stammkunde, Hochzeit" />
          </div>
        </div>
      )}

      {/* Speichern-Button */}
      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            border: 'none', borderRadius: '0.5rem', color: '#000',
            padding: '0.625rem 2rem', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>save</span>
          {saving ? 'Speichern...' : (isEdit ? 'Änderungen speichern' : 'Kontakt erstellen')}
        </button>
        <Link to={backPath} style={{ ...btnSecondary, textDecoration: 'none' }}>
          Abbrechen
        </Link>
      </div>
    </PageWrapper>
  );
}
