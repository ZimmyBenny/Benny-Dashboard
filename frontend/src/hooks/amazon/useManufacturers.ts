import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ManufacturersPayload, type ManufacturerPatch, type OfferPatch,
  fetchManufacturers, createManufacturer, updateManufacturer, deleteManufacturer, reorderManufacturers,
  createOffer, updateOffer, deleteOffer, reorderOffers,
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

// Preis bestmöglich in Zahl wandeln (für „günstigstes" hervorheben). Nicht parsebar -> null.
export function parsePreis(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
