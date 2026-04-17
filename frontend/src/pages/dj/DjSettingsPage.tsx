import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import apiClient from '../../api/client';
import {
  fetchDjSettingByKey,
  fetchDjSequences,
  updateDjSetting,
  uploadDjLogo,
  deleteDjLogo,
  fetchDjLogoPath,
  fetchDjDefaultTexts,
  type DjCompanySettings,
  type DjTaxSettings,
  type DjPaymentTermsSettings,
  type DjNumberSequence,
} from '../../api/dj.api';

// ── Shared Styles ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: '0.75rem',
  padding: '1.5rem',
  marginBottom: '1.5rem',
};

const inputBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,170,255,0.2)',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box' as const,
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const inputFocusStyle: React.CSSProperties = {
  borderColor: '#94aaff',
  boxShadow: '0 0 0 3px rgba(148,170,255,0.12)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--color-on-surface-variant)',
  marginBottom: '0.25rem',
  fontFamily: 'var(--font-body)',
  letterSpacing: '0.04em',
};

function saveButtonStyle(isDirty: boolean): React.CSSProperties {
  return {
    marginTop: '1.25rem',
    padding: '0.5rem 1.5rem',
    background: isDirty ? 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)' : 'rgba(255,255,255,0.06)',
    color: isDirty ? '#060e20' : 'var(--color-on-surface-variant)',
    border: 'none',
    borderRadius: '0.5rem',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: isDirty ? 'pointer' : 'not-allowed',
    boxShadow: isDirty ? '0 0 12px rgba(148,170,255,0.25)' : 'none',
    transition: 'all 0.2s',
  };
}

// ── Section Heading ────────────────────────────────────────────────────────────

function SectionHeading({ icon, title, accent }: { icon: string; title: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', paddingBottom: '1.25rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '0.5rem',
        background: `rgba(${accent ?? '148,170,255'}, 0.12)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: accent ? `rgb(${accent})` : '#94aaff' }}>{icon}</span>
      </div>
      <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
        {title}
      </h2>
    </div>
  );
}

// ── FocusInput ─────────────────────────────────────────────────────────────────

function FocusInput({ type = 'text', value, onChange, placeholder }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputBase, ...(focused ? inputFocusStyle : {}) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ── Logo ───────────────────────────────────────────────────────────────────────

function LogoSection() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [logoBlobUrl, setLogoBlobUrl] = useState<string | null>(null);

  const { data: logoPath } = useQuery<string | null>({
    queryKey: ['dj-setting', 'logo_path'],
    queryFn: fetchDjLogoPath,
  });

  const hasLogo = !!logoPath;

  // Logo via Axios (mit Auth-Token) laden und als Blob-URL anzeigen
  // <img src="..."> würde keinen Bearer-Token senden → 401
  useEffect(() => {
    if (!hasLogo) { setLogoBlobUrl(null); return; }
    let revoked = false;
    apiClient.get('/dj/settings/logo', { responseType: 'blob' })
      .then(r => {
        if (revoked) return;
        const url = URL.createObjectURL(r.data as Blob);
        setLogoBlobUrl(url);
      })
      .catch(() => setLogoBlobUrl(null));
    return () => { revoked = true; if (logoBlobUrl) URL.revokeObjectURL(logoBlobUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLogo, logoPath]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await uploadDjLogo(file);
      await queryClient.invalidateQueries({ queryKey: ['dj-setting', 'logo_path'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setUploadError(`Upload fehlgeschlagen: ${msg}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDelete() {
    if (!window.confirm('Logo wirklich entfernen?')) return;
    setUploadError(null);
    try {
      await deleteDjLogo();
      setLogoBlobUrl(null);
      await queryClient.invalidateQueries({ queryKey: ['dj-setting', 'logo_path'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setUploadError(`Löschen fehlgeschlagen: ${msg}`);
    }
  }

  return (
    <div style={cardStyle}>
      <SectionHeading icon="image" title="Logo" />

      {/* Logo-Vorschau */}
      <div style={{
        marginBottom: '1rem',
        padding: '1rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148,170,255,0.1)',
        borderRadius: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100px',
      }}>
        {hasLogo && logoBlobUrl ? (
          <img
            src={logoBlobUrl}
            alt="Firmenlogo"
            style={{ maxWidth: '200px', maxHeight: '80px', objectFit: 'contain' }}
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.375rem',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2rem', opacity: 0.4 }}>image_not_supported</span>
            Kein Logo hinterlegt
          </div>
        )}
      </div>

      {/* Fehler-Anzeige */}
      {uploadError && (
        <p style={{
          color: 'var(--color-error)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>error</span>
          {uploadError}
        </p>
      )}

      {/* Aktions-Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '0.5rem 1.25rem',
            background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
            color: '#060e20',
            border: 'none',
            borderRadius: '0.5rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>upload</span>
          Logo hochladen
        </button>

        {hasLogo && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            style={{
              padding: '0.5rem 1.25rem',
              background: 'rgba(255,110,132,0.12)',
              color: 'var(--color-error)',
              border: '1px solid rgba(255,110,132,0.3)',
              borderRadius: '0.5rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
            Logo entfernen
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        style={{ display: 'none' }}
        onChange={e => void handleFileChange(e)}
      />

      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.75rem',
        color: 'var(--color-on-surface-variant)',
        marginTop: '0.75rem',
        marginBottom: 0,
      }}>
        PNG, JPEG, SVG oder WebP — max. 2 MB. SVG wird im PDF nicht dargestellt.
      </p>
    </div>
  );
}

// ── Textbausteine ──────────────────────────────────────────────────────────────

function TextBausteineSection() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'du' | 'sie'>('du');

  const { data: duData } = useQuery<{ header: string; footer: string }>({
    queryKey: ['dj-setting', 'textbausteine', 'du'],
    queryFn: () => fetchDjDefaultTexts('du'),
  });
  const { data: sieData } = useQuery<{ header: string; footer: string }>({
    queryKey: ['dj-setting', 'textbausteine', 'sie'],
    queryFn: () => fetchDjDefaultTexts('sie'),
  });

  const [duHeader, setDuHeader] = useState('');
  const [duFooter, setDuFooter] = useState('');
  const [sieHeader, setSieHeader] = useState('');
  const [sieFooter, setSieFooter] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => { if (duData) { setDuHeader(duData.header ?? ''); setDuFooter(duData.footer ?? ''); } }, [duData]);
  useEffect(() => { if (sieData) { setSieHeader(sieData.header ?? ''); setSieFooter(sieData.footer ?? ''); } }, [sieData]);

  const isDirtyDu = duHeader !== (duData?.header ?? '') || duFooter !== (duData?.footer ?? '');
  const isDirtySie = sieHeader !== (sieData?.header ?? '') || sieFooter !== (sieData?.footer ?? '');
  const isDirty = activeTab === 'du' ? isDirtyDu : isDirtySie;

  const mutation = useMutation({
    mutationFn: async () => {
      if (activeTab === 'du') {
        await Promise.all([
          updateDjSetting('default_header_text_du', duHeader),
          updateDjSetting('default_footer_text_du', duFooter),
        ]);
      } else {
        await Promise.all([
          updateDjSetting('default_header_text_sie', sieHeader),
          updateDjSetting('default_footer_text_sie', sieFooter),
        ]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-setting', 'textbausteine', activeTab] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const codeStyle: React.CSSProperties = {
    background: 'rgba(148,170,255,0.1)',
    padding: '0.1em 0.3em',
    borderRadius: '0.25rem',
    fontSize: '0.875em',
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.375rem 1.125rem',
    background: active ? 'rgba(148,170,255,0.15)' : 'transparent',
    border: active ? '1px solid rgba(148,170,255,0.4)' : '1px solid rgba(148,170,255,0.12)',
    borderRadius: '0.5rem',
    color: active ? '#94aaff' : 'var(--color-on-surface-variant)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  const headerLocal = activeTab === 'du' ? duHeader : sieHeader;
  const footerLocal = activeTab === 'du' ? duFooter : sieFooter;
  const setHeaderLocal = activeTab === 'du' ? setDuHeader : setSieHeader;
  const setFooterLocal = activeTab === 'du' ? setDuFooter : setSieFooter;

  const headerPlaceholder = activeTab === 'du'
    ? 'z.B. Hey {{KONTAKTPERSON}},\n\nvielen Dank für deine Anfrage...'
    : 'z.B. Sehr geehrte(r) {{KONTAKTPERSON}},\n\nvielen Dank für Ihre Anfrage...';
  const footerPlaceholder = activeTab === 'du'
    ? 'z.B. Das Angebot gilt bis {{DATUM}}.'
    : 'z.B. Dieses Angebot ist gültig bis {{DATUM}}.';

  return (
    <div style={cardStyle}>
      <SectionHeading icon="description" title="Textbausteine" />

      {/* Tab-Leiste */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button type="button" style={tabBtnStyle(activeTab === 'du')} onClick={() => setActiveTab('du')}>
          Du-Form
        </button>
        <button type="button" style={tabBtnStyle(activeTab === 'sie')} onClick={() => setActiveTab('sie')}>
          Sie-Form
        </button>
        {isDirtyDu && activeTab !== 'du' && (
          <span style={{ fontSize: '0.75rem', color: '#f5a623', alignSelf: 'center', fontFamily: 'var(--font-body)' }}>
            • Du-Form hat ungespeicherte Änderungen
          </span>
        )}
        {isDirtySie && activeTab !== 'sie' && (
          <span style={{ fontSize: '0.75rem', color: '#f5a623', alignSelf: 'center', fontFamily: 'var(--font-body)' }}>
            • Sie-Form hat ungespeicherte Änderungen
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.875rem', maxWidth: '720px' }}>
        <div>
          <label style={labelStyle}>Standard-Kopftext ({activeTab === 'du' ? 'Du-Form' : 'Sie-Form'})</label>
          <textarea
            rows={6}
            value={headerLocal}
            onChange={e => setHeaderLocal(e.target.value)}
            style={{
              ...inputBase,
              resize: 'vertical',
              ...(focusedField === 'header' ? inputFocusStyle : {}),
            }}
            onFocus={() => setFocusedField('header')}
            onBlur={() => setFocusedField(null)}
            placeholder={headerPlaceholder}
          />
        </div>

        <div>
          <label style={labelStyle}>Standard-Fußtext ({activeTab === 'du' ? 'Du-Form' : 'Sie-Form'})</label>
          <textarea
            rows={6}
            value={footerLocal}
            onChange={e => setFooterLocal(e.target.value)}
            style={{
              ...inputBase,
              resize: 'vertical',
              ...(focusedField === 'footer' ? inputFocusStyle : {}),
            }}
            onFocus={() => setFocusedField('footer')}
            onBlur={() => setFocusedField(null)}
            placeholder={footerPlaceholder}
          />
        </div>
      </div>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.775rem',
        color: 'var(--color-on-surface-variant)',
        marginTop: '0.75rem',
        marginBottom: 0,
        fontStyle: 'italic',
      }}>
        Platzhalter: <code style={codeStyle}>{'{{KONTAKTPERSON}}'}</code>,{' '}
        <code style={codeStyle}>{'{{DATUM}}'}</code>,{' '}
        <code style={codeStyle}>{'{{ANGEBOTSNUMMER}}'}</code>,{' '}
        <code style={codeStyle}>{'{{KUNDENNUMMER}}'}</code>{' '}
        — werden beim PDF-Export automatisch ersetzt.
      </p>

      {saveSuccess && !isDirty && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#5cfd80', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
          Gespeichert
        </p>
      )}

      <button
        disabled={!isDirty || mutation.isPending}
        style={saveButtonStyle(isDirty && !mutation.isPending)}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Speichert…' : `${activeTab === 'du' ? 'Du-Form' : 'Sie-Form'} speichern`}
      </button>
    </div>
  );
}

// ── Firmendaten ────────────────────────────────────────────────────────────────

const defaultCompany: DjCompanySettings = {
  name: '', street: '', zip: '', city: '', country: '',
  phone: '', email: '', website: '', tax_id: '',
  bank_name: '', iban: '', bic: '',
};

function CompanySection() {
  const queryClient = useQueryClient();
  const { data: queryData, isError } = useQuery<DjCompanySettings>({
    queryKey: ['dj-setting', 'company'],
    queryFn: () => fetchDjSettingByKey<DjCompanySettings>('company'),
  });

  const [local, setLocal] = useState<DjCompanySettings>(defaultCompany);
  useEffect(() => { if (queryData) setLocal(queryData); }, [queryData]);

  const isDirty = JSON.stringify(local) !== JSON.stringify(queryData ?? defaultCompany);

  const mutation = useMutation({
    mutationFn: (data: DjCompanySettings) => updateDjSetting('company', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-setting', 'company'] }),
  });

  const f = (key: keyof DjCompanySettings, label: string, type = 'text') => (
    <div key={key}>
      <label style={labelStyle}>{label}</label>
      <FocusInput
        type={type}
        value={local[key]}
        onChange={v => setLocal(prev => ({ ...prev, [key]: v }))}
      />
    </div>
  );

  if (isError) return (
    <div style={cardStyle}>
      <SectionHeading icon="business" title="Firmendaten" />
      <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Einstellungen konnten nicht geladen werden.</p>
    </div>
  );

  return (
    <div style={cardStyle}>
      <SectionHeading icon="business" title="Firmendaten" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
        {f('name', 'Firmenname')}
        {f('street', 'Straße & Hausnummer')}
        {f('zip', 'PLZ')}
        {f('city', 'Stadt')}
        {f('country', 'Land')}
        {f('phone', 'Telefon')}
        {f('email', 'E-Mail', 'email')}
        {f('website', 'Website')}
        {f('tax_id', 'Steuernummer / USt-ID')}
        {f('bank_name', 'Bank')}
        {f('iban', 'IBAN')}
        {f('bic', 'BIC')}
      </div>
      {mutation.isSuccess && !isDirty && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#5cfd80', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
          Gespeichert
        </p>
      )}
      <button disabled={!isDirty} style={saveButtonStyle(isDirty)} onClick={() => mutation.mutate(local)}>
        {mutation.isPending ? 'Speichert…' : 'Speichern'}
      </button>
    </div>
  );
}

// ── Steuereinstellungen ────────────────────────────────────────────────────────

const defaultTax: DjTaxSettings = { vat_rate: 19, small_business: false };

function TaxSection() {
  const queryClient = useQueryClient();
  const { data: queryData, isError } = useQuery<DjTaxSettings>({
    queryKey: ['dj-setting', 'tax'],
    queryFn: () => fetchDjSettingByKey<DjTaxSettings>('tax'),
  });

  const [local, setLocal] = useState<DjTaxSettings>(defaultTax);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (queryData) setLocal(queryData); }, [queryData]);

  const isDirty = JSON.stringify(local) !== JSON.stringify(queryData ?? defaultTax);

  const mutation = useMutation({
    mutationFn: (data: DjTaxSettings) => updateDjSetting('tax', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-setting', 'tax'] }),
  });

  if (isError) return (
    <div style={cardStyle}>
      <SectionHeading icon="percent" title="Steuereinstellungen" />
      <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Einstellungen konnten nicht geladen werden.</p>
    </div>
  );

  return (
    <div style={cardStyle}>
      <SectionHeading icon="percent" title="Steuereinstellungen" accent="92,253,128" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', maxWidth: '600px' }}>
        <div>
          <label style={labelStyle}>Mehrwertsteuersatz (%)</label>
          <input
            type="number" min={0} max={100}
            value={local.vat_rate}
            onChange={e => setLocal(prev => ({ ...prev, vat_rate: Number(e.target.value) }))}
            style={{ ...inputBase, ...(focused ? inputFocusStyle : {}) }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1.25rem' }}>
          <input
            type="checkbox"
            id="small_business"
            checked={local.small_business}
            onChange={e => setLocal(prev => ({ ...prev, small_business: e.target.checked }))}
            style={{ width: '1.125rem', height: '1.125rem', cursor: 'pointer', accentColor: '#94aaff' }}
          />
          <label htmlFor="small_business" style={{ ...labelStyle, margin: 0, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: '0.875rem', fontWeight: 500 }}>
            Kleinunternehmer (§19 UStG)
          </label>
        </div>
      </div>
      {local.small_business && (
        <p style={{ marginTop: '0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', fontStyle: 'italic' }}>
          Im Kleinunternehmer-Modus wird keine MwSt. auf Rechnungen ausgewiesen.
        </p>
      )}
      {mutation.isSuccess && !isDirty && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#5cfd80', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
          Gespeichert
        </p>
      )}
      <button disabled={!isDirty} style={saveButtonStyle(isDirty)} onClick={() => mutation.mutate(local)}>
        {mutation.isPending ? 'Speichert…' : 'Speichern'}
      </button>
    </div>
  );
}

// ── Zahlungskonditionen ────────────────────────────────────────────────────────

const defaultPayment: DjPaymentTermsSettings = { days: 14, note: '' };

function PaymentTermsSection() {
  const queryClient = useQueryClient();
  const { data: queryData, isError } = useQuery<DjPaymentTermsSettings>({
    queryKey: ['dj-setting', 'payment_terms'],
    queryFn: () => fetchDjSettingByKey<DjPaymentTermsSettings>('payment_terms'),
  });

  const [local, setLocal] = useState<DjPaymentTermsSettings>(defaultPayment);
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => { if (queryData) setLocal(queryData); }, [queryData]);

  const isDirty = JSON.stringify(local) !== JSON.stringify(queryData ?? defaultPayment);

  const mutation = useMutation({
    mutationFn: (data: DjPaymentTermsSettings) => updateDjSetting('payment_terms', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-setting', 'payment_terms'] }),
  });

  if (isError) return (
    <div style={cardStyle}>
      <SectionHeading icon="payments" title="Zahlungskonditionen" />
      <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Einstellungen konnten nicht geladen werden.</p>
    </div>
  );

  return (
    <div style={cardStyle}>
      <SectionHeading icon="payments" title="Zahlungskonditionen" accent="183,148,244" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.875rem', maxWidth: '600px' }}>
        <div>
          <label style={labelStyle}>Zahlungsziel (Tage)</label>
          <input
            type="number" min={0}
            value={local.days}
            onChange={e => setLocal(prev => ({ ...prev, days: Number(e.target.value) }))}
            style={{ ...inputBase, ...(focused === 'days' ? inputFocusStyle : {}) }}
            onFocus={() => setFocused('days')}
            onBlur={() => setFocused(null)}
          />
        </div>
        <div>
          <label style={labelStyle}>Hinweis / Zahlungstext</label>
          <textarea
            rows={3}
            value={local.note}
            onChange={e => setLocal(prev => ({ ...prev, note: e.target.value }))}
            style={{
              ...inputBase, resize: 'vertical',
              ...(focused === 'note' ? inputFocusStyle : {}),
            }}
            onFocus={() => setFocused('note')}
            onBlur={() => setFocused(null)}
          />
        </div>
      </div>
      {mutation.isSuccess && !isDirty && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#5cfd80', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
          Gespeichert
        </p>
      )}
      <button disabled={!isDirty} style={saveButtonStyle(isDirty)} onClick={() => mutation.mutate(local)}>
        {mutation.isPending ? 'Speichert…' : 'Speichern'}
      </button>
    </div>
  );
}

// ── Nummernkreise ──────────────────────────────────────────────────────────────

function SequencesSection() {
  const { data: sequences, isLoading, isError } = useQuery<DjNumberSequence[]>({
    queryKey: ['dj-sequences'],
    queryFn: fetchDjSequences,
  });

  return (
    <div style={cardStyle}>
      <SectionHeading icon="pin" title="Nummernkreise" accent="148,170,255" />
      <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontStyle: 'italic', marginBottom: '1.25rem', marginTop: 0 }}>
        Nummernkreise werden automatisch vergeben und können hier nicht manuell geändert werden.
      </p>

      {isError && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Konnte nicht geladen werden.</p>}
      {isLoading && <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Lade…</p>}

      {sequences && (
        <div style={{ borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid rgba(148,170,255,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'rgba(148,170,255,0.07)' }}>
                {['Typ', 'Präfix', 'Aktueller Stand', 'Format'].map(col => (
                  <th key={col} style={{
                    padding: '0.625rem 1rem', textAlign: 'left',
                    fontWeight: 600, color: 'var(--color-on-surface-variant)',
                    fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq, i) => (
                <tr
                  key={seq.id}
                  style={{
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <td style={{ padding: '0.625rem 1rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>{seq.entity_type}</td>
                  <td style={{ padding: '0.625rem 1rem', color: '#94aaff', fontWeight: 600, fontFamily: 'monospace' }}>{seq.prefix}</td>
                  <td style={{ padding: '0.625rem 1rem', color: 'var(--color-on-surface)', fontWeight: 700 }}>{seq.current_value}</td>
                  <td style={{ padding: '0.625rem 1rem', color: 'var(--color-on-surface-variant)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{seq.format}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function DjSettingsPage() {
  return (
    <PageWrapper>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>

        {/* Ambient Glow */}
        <div style={{
          position: 'absolute', top: '-60px', right: '0',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(148,170,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>

          {/* Page Header */}
          <div style={{ marginBottom: '2.5rem' }}>
<h1 style={{
              fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2.25rem',
              color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              Einstellungen
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
              Firmendaten, Steuer, Zahlungskonditionen und Nummernkreise
            </p>
          </div>

          <CompanySection />
          <LogoSection />
          <TaxSection />
          <PaymentTermsSection />
          <TextBausteineSection />
          <SequencesSection />

        </div>
      </div>
    </PageWrapper>
  );
}
