import { type AmazonProduct } from '../../api/amazon.api';
import { ProductColumn } from './ProductColumn';

interface Props {
  products: AmazonProduct[];
  showDiscarded: boolean;
  onRequestDelete: (product: AmazonProduct) => void;
}

export function ProductBoard({ products, showDiscarded, onRequestDelete }: Props) {
  const byStatus = {
    interessant: products.filter(p => p.status === 'interessant'),
    warteliste:  products.filter(p => p.status === 'warteliste'),
    aktiv:       products.filter(p => p.status === 'aktiv'),
    bestehend:   products.filter(p => p.status === 'bestehend'),
    verworfen:   products.filter(p => p.status === 'verworfen'),
  };
  return (
    <div className={`grid gap-4 ${showDiscarded ? 'grid-cols-5' : 'grid-cols-4'}`}>
      <ProductColumn title="Warteliste" icon="schedule" accent="#fbbf24"
        products={byStatus.warteliste} status="warteliste"
        emptyText="Keine Produkte auf der Warteliste" onRequestDelete={onRequestDelete} />
      <ProductColumn title="Interessant" icon="star" accent="#60a5fa"
        products={byStatus.interessant} status="interessant"
        emptyText="Keine interessanten Produkte" onRequestDelete={onRequestDelete} />
      <ProductColumn title="Aktiv am entwickeln" icon="settings" accent="#60a5fa"
        products={byStatus.aktiv} status="aktiv"
        emptyText="Noch keine aktiven Produkte" onRequestDelete={onRequestDelete} />
      <ProductColumn title="Meine bestehenden Produkte" icon="check_circle" accent="#34d399"
        products={byStatus.bestehend} status="bestehend"
        emptyText="Noch keine bestehenden Produkte" onRequestDelete={onRequestDelete} />
      {showDiscarded && (
        <ProductColumn title="Verworfen" icon="archive" accent="#fdba74"
          products={byStatus.verworfen} status="verworfen"
          emptyText="Keine verworfenen Produkte" onRequestDelete={onRequestDelete} />
      )}
    </div>
  );
}
