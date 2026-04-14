import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjSettingByKey,
  fetchDjSequences,
  updateDjSetting,
  type DjCompanySettings,
  type DjTaxSettings,
  type DjPaymentTermsSettings,
  type DjNumberSequence,
} from '../../api/dj.api';

// ── Styles ─────────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: 'var(--color-surface-container)',
  borderRadius: '0.75rem',
  padding: '1.5rem',
  marginBottom: '1.5rem',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  paddingBottom: '1rem',
  marginBottom: '1rem',
  borderBottom: '1px solid var(--color-surface-container-high)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'var(--color-on-surface-variant)',
  marginBottom: '0.25rem',
  fontFamily: 'var(--font-body)',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  border: '1px solid var(--color-surface-container-high)',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box' as const,
  outline: 'none',
};

const saveButtonStyle = (isDirty: boolean): React.CSSProperties => ({
  marginTop: '1rem',
  padding: '0.5rem 1.25rem',
  background: 'var(--color-primary)',
  color: 'var(--color-on-primary)',
  border: 'none',
  borderRadius: '0.5rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: isDirty ? 'pointer' : 'not-allowed',
  opacity: isDirty ? 1 : 0.4,
  transition: 'opacity 0.15s',
});

// ── Section Heading ────────────────────────────────────────────────────────────

function SectionHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={sectionHeaderStyle}>
      <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-primary)' }}>{icon}</span>
      <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1.0625rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>
        {title}
      </h2>
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
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (queryData) setLocal(queryData);
  }, [queryData]);

  const isDirty = JSON.stringify(local) !== JSON.stringify(queryData ?? defaultCompany);

  const mutation = useMutation({
    mutationFn: (data: DjCompanySettings) => updateDjSetting('company', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-setting', 'company'] }),
  });

  if (isError) {
    return (
      <div style={sectionStyle}>
        <SectionHeading icon="business" title="Firmendaten" />
        <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Einstellungen konnten nicht geladen werden.</p>
      </div>
    );
  }

  const field = (key: keyof DjCompanySettings, label: string, type = 'text') => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={local[key]}
        onChange={e => setLocal(prev => ({ ...prev, [key]: e.target.value }))}
        style={{
          ...inputStyle,
          borderColor: focusedField === key ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
        }}
        onFocus={() => setFocusedField(key)}
        onBlur={() => setFocusedField(null)}
      />
    </div>
  );

  return (
    <div style={sectionStyle}>
      <SectionHeading icon="business" title="Firmendaten" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {field('name', 'Firmenname')}
        {field('street', 'Straße & Hausnummer')}
        {field('zip', 'PLZ')}
        {field('city', 'Stadt')}
        {field('country', 'Land')}
        {field('phone', 'Telefon')}
        {field('email', 'E-Mail', 'email')}
        {field('website', 'Website')}
        {field('tax_id', 'Steuernummer / USt-ID')}
        {field('bank_name', 'Bank')}
        {field('iban', 'IBAN')}
        {field('bic', 'BIC')}
      </div>
      <button
        disabled={!isDirty}
        style={saveButtonStyle(isDirty)}
        onClick={() => mutation.mutate(local)}
      >
        {mutation.isPending ? 'Speichert...' : 'Speichern'}
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
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (queryData) setLocal(queryData);
  }, [queryData]);

  const isDirty = JSON.stringify(local) !== JSON.stringify(queryData ?? defaultTax);

  const mutation = useMutation({
    mutationFn: (data: DjTaxSettings) => updateDjSetting('tax', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-setting', 'tax'] }),
  });

  if (isError) {
    return (
      <div style={sectionStyle}>
        <SectionHeading icon="percent" title="Steuereinstellungen" />
        <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Einstellungen konnten nicht geladen werden.</p>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <SectionHeading icon="percent" title="Steuereinstellungen" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Mehrwertsteuersatz (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={local.vat_rate}
            onChange={e => setLocal(prev => ({ ...prev, vat_rate: Number(e.target.value) }))}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'vat_rate' ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
            }}
            onFocus={() => setFocusedField('vat_rate')}
            onBlur={() => setFocusedField(null)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1.25rem' }}>
          <input
            type="checkbox"
            id="small_business"
            checked={local.small_business}
            onChange={e => setLocal(prev => ({ ...prev, small_business: e.target.checked }))}
            style={{ width: '1.125rem', height: '1.125rem', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
          />
          <label htmlFor="small_business" style={{ ...labelStyle, margin: 0, cursor: 'pointer' }}>
            Kleinunternehmer (§19 UStG)
          </label>
        </div>
      </div>
      {local.small_business && (
        <p style={{ marginTop: '0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', fontStyle: 'italic' }}>
          Im Kleinunternehmer-Modus wird keine MwSt. ausgewiesen.
        </p>
      )}
      <button
        disabled={!isDirty}
        style={saveButtonStyle(isDirty)}
        onClick={() => mutation.mutate(local)}
      >
        {mutation.isPending ? 'Speichert...' : 'Speichern'}
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
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (queryData) setLocal(queryData);
  }, [queryData]);

  const isDirty = JSON.stringify(local) !== JSON.stringify(queryData ?? defaultPayment);

  const mutation = useMutation({
    mutationFn: (data: DjPaymentTermsSettings) => updateDjSetting('payment_terms', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-setting', 'payment_terms'] }),
  });

  if (isError) {
    return (
      <div style={sectionStyle}>
        <SectionHeading icon="payments" title="Zahlungskonditionen" />
        <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Einstellungen konnten nicht geladen werden.</p>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <SectionHeading icon="payments" title="Zahlungskonditionen" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', maxWidth: '600px' }}>
        <div>
          <label style={labelStyle}>Zahlungsziel (Tage)</label>
          <input
            type="number"
            min={0}
            value={local.days}
            onChange={e => setLocal(prev => ({ ...prev, days: Number(e.target.value) }))}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'days' ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
            }}
            onFocus={() => setFocusedField('days')}
            onBlur={() => setFocusedField(null)}
          />
        </div>
        <div>
          <label style={labelStyle}>Hinweis</label>
          <textarea
            rows={3}
            value={local.note}
            onChange={e => setLocal(prev => ({ ...prev, note: e.target.value }))}
            style={{
              ...inputStyle,
              resize: 'vertical',
              borderColor: focusedField === 'note' ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
            }}
            onFocus={() => setFocusedField('note')}
            onBlur={() => setFocusedField(null)}
          />
        </div>
      </div>
      <button
        disabled={!isDirty}
        style={saveButtonStyle(isDirty)}
        onClick={() => mutation.mutate(local)}
      >
        {mutation.isPending ? 'Speichert...' : 'Speichern'}
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
    <div style={sectionStyle}>
      <SectionHeading icon="pin" title="Nummernkreise" />
      <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontStyle: 'italic', marginBottom: '1rem' }}>
        Nummernkreise werden automatisch verwaltet und können hier nicht bearbeitet werden.
      </p>

      {isError && (
        <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Einstellungen konnten nicht geladen werden.</p>
      )}

      {isLoading && (
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Lade...</p>
      )}

      {sequences && (
        <div style={{ borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--color-surface-container-high)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-container-high)' }}>
                {['Typ', 'Präfix', 'Aktueller Stand', 'Format'].map(col => (
                  <th key={col} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-on-surface)', fontSize: '0.75rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq, i) => (
                <tr
                  key={seq.id}
                  style={{ background: i % 2 === 0 ? 'var(--color-surface-container)' : 'var(--color-surface-container-low)' }}
                >
                  <td style={{ padding: '0.625rem 1rem', color: 'var(--color-on-surface)' }}>{seq.entity_type}</td>
                  <td style={{ padding: '0.625rem 1rem', color: 'var(--color-on-surface)' }}>{seq.prefix}</td>
                  <td style={{ padding: '0.625rem 1rem', color: 'var(--color-on-surface)' }}>{seq.current_value}</td>
                  <td style={{ padding: '0.625rem 1rem', color: 'var(--color-on-surface-variant)', fontFamily: 'monospace' }}>{seq.format}</td>
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
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
            DJ Einstellungen
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
            Firmendaten, Steuer, Zahlungskonditionen und Nummernkreise
          </p>
        </div>

        <CompanySection />
        <TaxSection />
        <PaymentTermsSection />
        <SequencesSection />
      </div>
    </PageWrapper>
  );
}
