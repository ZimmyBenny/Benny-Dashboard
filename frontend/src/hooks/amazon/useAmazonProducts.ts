import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type AmazonProduct, type AmazonProductStatus,
  fetchAmazonProducts, createAmazonProduct, updateAmazonProduct,
  deleteAmazonProduct, uploadAmazonProductImage, deleteAmazonProductImage,
} from '../../api/amazon.api';

export const AMAZON_PRODUCTS_KEY = ['amazon', 'products'] as const;

// Praezise Filter-Funktion: matcht NUR die Produkt-Listen-Query.
// Wichtig, weil andere Queries (z.B. ['amazon','products', id, 'checklist'])
// mit demselben Prefix beginnen, aber Objekt-Daten haben — list.map crasht sonst.
const productsListFilter = (queryKey: readonly unknown[]) =>
  queryKey[0] === 'amazon' && queryKey[1] === 'products' &&
  queryKey.length === 3 && typeof queryKey[2] === 'object';

export function useAmazonProducts(includeDiscarded: boolean) {
  return useQuery({
    queryKey: [...AMAZON_PRODUCTS_KEY, { includeDiscarded }],
    queryFn: () => fetchAmazonProducts(includeDiscarded),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: AMAZON_PRODUCTS_KEY });
}

export function useCreateAmazonProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => createAmazonProduct(name),
    onSuccess: invalidate,
  });
}

export function useUpdateAmazonProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: AmazonProductStatus }) =>
      updateAmazonProduct(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: AMAZON_PRODUCTS_KEY });
      const snapshots = qc.getQueriesData<AmazonProduct[]>({ queryKey: AMAZON_PRODUCTS_KEY });
      for (const [key, list] of snapshots) {
        if (!Array.isArray(list)) continue;
        qc.setQueryData<AmazonProduct[]>(key, list.map(p => p.id === id ? { ...p, status } : p));
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, list] of ctx?.snapshots ?? []) qc.setQueryData(key, list);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AMAZON_PRODUCTS_KEY }),
  });
}

export function useUpdateAmazonProductNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string | null }) =>
      updateAmazonProduct(id, { notes }),
    onMutate: async ({ id, notes }) => {
      await qc.cancelQueries({ queryKey: AMAZON_PRODUCTS_KEY });
      const snapshots = qc.getQueriesData<AmazonProduct[]>({ queryKey: AMAZON_PRODUCTS_KEY });
      for (const [key, list] of snapshots) {
        if (!Array.isArray(list)) continue;
        qc.setQueryData<AmazonProduct[]>(key, list.map(p => p.id === id ? { ...p, notes } : p));
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, list] of ctx?.snapshots ?? []) qc.setQueryData(key, list);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AMAZON_PRODUCTS_KEY }),
  });
}

export function useDeleteAmazonProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => deleteAmazonProduct(id),
    onSuccess: invalidate,
  });
}

export function useUploadAmazonProductImage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => uploadAmazonProductImage(id, file),
    onSuccess: invalidate,
  });
}

export function useDeleteAmazonProductImage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => deleteAmazonProductImage(id),
    onSuccess: invalidate,
  });
}
