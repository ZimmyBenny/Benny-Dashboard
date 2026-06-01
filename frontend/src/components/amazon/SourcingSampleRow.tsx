import { useEffect, useState } from 'react';
import {
  type SamplePatch, type SampleQuality, type SampleStatus, type SourcingSample,
} from '../../api/amazon.api';
import { useUpdateSample } from '../../hooks/amazon/useSourcing';

const QUALITY_OPTIONS: Array<{ value: SampleQuality; label: string }> = [
  { value: 'sehr_gut', label: 'Sehr gut' },
  { value: 'gut',      label: 'Gut' },
  { value: 'mittel',   label: 'Mittel' },
  { value: 'schlecht', label: 'Schlecht' },
];
const STATUS_OPTIONS: Array<{ value: SampleStatus; label: string }> = [
  { value: 'angefragt', label: 'Angefragt' },
  { value: 'bestellt',  label: 'Bestellt' },
  { value: 'erhalten',  label: 'Erhalten' },
  { value: 'abgelehnt', label: 'Abgelehnt' },
];

interface Props {
  productId: number;
  sample: SourcingSample;
  onRequestDelete: (sample: SourcingSample) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function SourcingSampleRow({ productId, sample, onRequestDelete }: Props) {
  const update = useUpdateSample(productId);

  const [hersteller, setHersteller] = useState(sample.hersteller ?? '');
  const [kosten, setKosten] = useState(sample.sample_kosten ?? '');
  const [besonderheiten, setBesonderheiten] = useState(sample.besonderheiten ?? '');
  const [lieferzeit, setLieferzeit] = useState(sample.lieferzeit ?? '');
  const [notizen, setNotizen] = useState(sample.notizen ?? '');

  useEffect(() => { setHersteller(sample.hersteller ?? ''); }, [sample.hersteller]);
  useEffect(() => { setKosten(sample.sample_kosten ?? ''); }, [sample.sample_kosten]);
  useEffect(() => { setBesonderheiten(sample.besonderheiten ?? ''); }, [sample.besonderheiten]);
  useEffect(() => { setLieferzeit(sample.lieferzeit ?? ''); }, [sample.lieferzeit]);
  useEffect(() => { setNotizen(sample.notizen ?? ''); }, [sample.notizen]);

  function patch(p: SamplePatch) {
    update.mutate({ sampleId: sample.id, patch: p });
  }

  function saveText(field: keyof SamplePatch, current: string, original: string | null) {
    const trimmed = current.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === original) return;
    patch({ [field]: next } as SamplePatch);
  }

  function setWinner() {
    if (sample.is_winner === 1) return;
    patch({ is_winner: 1 });
  }

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <td className="p-2 text-center">
        <button
          type="button"
          aria-label={sample.is_winner === 1 ? 'Winner' : 'Als Winner markieren'}
          onClick={setWinner}
          className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            border: '2px solid ' + (sample.is_winner === 1 ? '#34d399' : 'rgba(255,255,255,0.3)'),
            background: sample.is_winner === 1 ? '#34d399' : 'transparent',
          }}
        >
          {sample.is_winner === 1 && (
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#fff' }}>check</span>
          )}
        </button>
      </td>

      <td className="p-2">
        <input
          type="text" value={hersteller}
          onChange={(e) => setHersteller(e.target.value)}
          onBlur={() => saveText('hersteller', hersteller, sample.hersteller)}
          maxLength={500}
          placeholder="Hersteller Name"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      <td className="p-2">
        <input
          type="text" value={kosten}
          onChange={(e) => setKosten(e.target.value)}
          onBlur={() => saveText('sample_kosten', kosten, sample.sample_kosten)}
          maxLength={500}
          placeholder="0.00 USD"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      <td className="p-2">
        <input
          type="text" value={besonderheiten}
          onChange={(e) => setBesonderheiten(e.target.value)}
          onBlur={() => saveText('besonderheiten', besonderheiten, sample.besonderheiten)}
          maxLength={500}
          placeholder="z.B. besondere Merkmale"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      <td className="p-2">
        <input
          type="text" value={lieferzeit}
          onChange={(e) => setLieferzeit(e.target.value)}
          onBlur={() => saveText('lieferzeit', lieferzeit, sample.lieferzeit)}
          maxLength={500}
          placeholder="z.B. 3-5 Tage"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      <td className="p-2">
        <select
          value={sample.qualitaet ?? ''}
          onChange={(e) => patch({ qualitaet: (e.target.value || null) as SampleQuality | null })}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        >
          <option value="">Qualität</option>
          {QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      <td className="p-2">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map(n => {
            const active = sample.bewertung !== null && n <= sample.bewertung;
            return (
              <button
                key={n}
                type="button"
                aria-label={`${n} Sterne`}
                onClick={() => patch({ bewertung: n })}
                className="w-5 h-5 flex items-center justify-center"
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '18px',
                    color: active ? '#fbbf24' : 'rgba(255,255,255,0.25)',
                    fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0',
                  }}
                >
                  star
                </span>
              </button>
            );
          })}
        </div>
      </td>

      <td className="p-2">
        <select
          value={sample.status ?? ''}
          onChange={(e) => patch({ status: (e.target.value || null) as SampleStatus | null })}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        >
          <option value="">Status</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      <td className="p-2">
        <input
          type="text" value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          onBlur={() => saveText('notizen', notizen, sample.notizen)}
          maxLength={500}
          placeholder="Sample-Notizen"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      <td className="p-2 text-right">
        <button
          type="button"
          onClick={() => onRequestDelete(sample)}
          aria-label="Sample löschen"
          className="p-1 rounded hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </td>
    </tr>
  );
}
