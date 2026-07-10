import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPackaging, savePackaging, setPackagingFinal, setPackagingCheck,
  createPackagingItem, deletePackagingItem, saveGpsr,
  type PackagingPatch, type PackagingItemCreate, type GpsrResponsible,
} from '../../api/amazon.api';

export const packagingKey = (productId: number) => ['amazon', 'packaging', productId] as const;

export function useAmazonPackaging(productId: number) {
  return useQuery({
    queryKey: packagingKey(productId),
    queryFn: () => fetchPackaging(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

function useInvalidate(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: packagingKey(productId) });
}

export function useSavePackaging(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({
    mutationFn: (patch: PackagingPatch) => savePackaging(productId, patch),
    onSettled: inv,
  });
}

export function useSetPackagingFinal(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({
    mutationFn: ({ box, final }: { box: 'single' | 'master'; final: 0 | 1 }) => setPackagingFinal(productId, box, final),
    onSettled: inv,
  });
}

export function useSetPackagingCheck(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({
    mutationFn: ({ itemId, status }: { itemId: number; status: 'erledigt' | 'nicht_zutreffend' | null }) =>
      setPackagingCheck(productId, itemId, status),
    onSettled: inv,
  });
}

export function useCreatePackagingItem(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({
    mutationFn: (body: PackagingItemCreate) => createPackagingItem(productId, body),
    onSettled: inv,
  });
}

export function useDeletePackagingItem(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({
    mutationFn: (itemId: number) => deletePackagingItem(productId, itemId),
    onSettled: inv,
  });
}

// GPSR-Verantwortlicher ist app-weit (zentral, gilt für alle Produkte). Gelesen wird er
// über GET /packaging (liefert data.gpsr.responsible mit); geschrieben über PUT /gpsr.
// Nach dem Speichern wird packagingKey invalidiert, damit alle offenen Produktseiten
// den aktualisierten Stand sehen — kein separater useQuery für GPSR nötig.
export function useSaveGpsr(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({
    mutationFn: (patch: Partial<GpsrResponsible>) => saveGpsr(patch),
    onSettled: inv,
  });
}
