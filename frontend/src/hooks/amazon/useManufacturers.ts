import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ManufacturersPayload, type ManufacturerPatch, type OfferPatch, type ManufacturerOffer,
  fetchManufacturers, createManufacturer, updateManufacturer, deleteManufacturer, reorderManufacturers,
  createOffer, updateOffer, deleteOffer, reorderOffers, updateManufacturerSettings,
  uploadOfferFile, deleteOfferFile,
} from '../../api/amazon.api';

export const manufacturersKey = (productId: number) =>
  ['amazon', 'products', productId, 'manufacturers'] as const;

function useInval(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: manufacturersKey(productId) });
}

export function useManufacturers(productId: number) {
  return useQuery({
    queryKey: manufacturersKey(productId),
    queryFn: () => fetchManufacturers(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}
export function useCreateManufacturer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (name?: string) => createManufacturer(productId, name), onSettled: inval });
}
export function useUpdateManufacturer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, patch }: { mId: number; patch: ManufacturerPatch }) => updateManufacturer(productId, mId, patch), onSettled: inval });
}
export function useDeleteManufacturer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (mId: number) => deleteManufacturer(productId, mId), onSettled: inval });
}
export function useReorderManufacturers(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (order: number[]) => reorderManufacturers(productId, order), onSettled: inval });
}
export function useCreateOffer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (mId: number) => createOffer(productId, mId), onSettled: inval });
}
export function useUpdateOffer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, oId, patch }: { mId: number; oId: number; patch: OfferPatch }) => updateOffer(productId, mId, oId, patch), onSettled: inval });
}
export function useDeleteOffer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, oId }: { mId: number; oId: number }) => deleteOffer(productId, mId, oId), onSettled: inval });
}
export function useReorderOffers(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, order }: { mId: number; order: number[] }) => reorderOffers(productId, mId, order), onSettled: inval });
}

export function useUpdateManufacturerSettings(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ usdEurRate, rateDate }: { usdEurRate: string; rateDate?: string | null }) => updateManufacturerSettings(productId, usdEurRate, rateDate), onSettled: inval });
}
export function useUploadOfferFile(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, oId, file }: { mId: number; oId: number; file: File }) => uploadOfferFile(productId, mId, oId, file), onSettled: inval });
}
export function useDeleteOfferFile(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, oId, fId }: { mId: number; oId: number; fId: number }) => deleteOfferFile(productId, mId, oId, fId), onSettled: inval });
}

// Preis bestmöglich in Zahl wandeln (für „günstigstes" hervorheben). Nicht parsebar -> null.
export function parsePreis(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function eurPreis(offer: { preis: string | null; currency: 'USD' | 'EUR' }, rate: number | null): number | null {
  const p = parsePreis(offer.preis);
  if (p === null) return null;
  if (offer.currency === 'EUR') return p;
  if (rate === null || rate === 0) return null;
  return p / rate;
}
