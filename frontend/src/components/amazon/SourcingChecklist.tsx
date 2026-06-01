import { type Sourcing, type SourcingCpKey } from '../../api/amazon.api';
import { useUpdateSourcing } from '../../hooks/amazon/useSourcing';

const ITEMS: Array<{ key: SourcingCpKey; label: string }> = [
  { key: 'cp_hersteller_gefiltert',       label: 'Hersteller gefiltert' },
  { key: 'cp_anforderungen_kommuniziert', label: 'Anforderungen kommuniziert' },
  { key: 'cp_erste_preise_erhalten',      label: 'Erste Preise erhalten' },
  { key: 'cp_usp_geprueft',               label: 'USP Umsetzbarkeit geprueft' },
  { key: 'cp_samples_angefragt',          label: 'Samples angefragt' },
  { key: 'cp_sample_analyse',             label: 'Sample Analyse durchgefuehrt' },
  { key: 'cp_vergleichstabelle',          label: 'Vergleichstabelle erstellt' },
  { key: 'cp_finale_verhandlung',         label: 'Finale Verhandlung durchgefuehrt' },
  { key: 'cp_zahlungsziel',               label: 'Zahlungsziel verhandelt' },
];

interface Props {
  productId: number;
  sourcing: Sourcing;
}

export function SourcingChecklist({ productId, sourcing }: Props) {
  const update = useUpdateSourcing(productId);

  function toggle(key: SourcingCpKey) {
    const next: 0 | 1 = sourcing[key] === 1 ? 0 : 1;
    update.mutate({ [key]: next } as Partial<Record<SourcingCpKey, 0 | 1>>);
  }

  return (
    <div className="px-5 pb-3">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-on-surface)' }}>
        Sourcing Schritte anzeigen
      </h3>
      <ul className="flex flex-col gap-2">
        {ITEMS.map(({ key, label }) => {
          const checked = sourcing[key] === 1;
          return (
            <li key={key}>
              <label
                className="flex items-center gap-2 cursor-pointer text-sm"
                style={{ color: 'var(--color-on-surface)' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(key)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {label}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
