import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type BrandName, type BrandPatch, type BrandPayload,
  type BrandCandidate, type CandidatePatch,
  fetchBrand, updateBrand as apiUpdateBrand,
  createCandidate as apiCreateCandidate,
  updateCandidate as apiUpdateCandidate,
  deleteCandidate as apiDeleteCandidate,
} from '../../api/amazon.api';

export const brandKey = (productId: number) =>
  ['amazon', 'products', productId, 'brand'] as const;

export function useBrand(productId: number) {
  return useQuery({
    queryKey: brandKey(productId),
    queryFn: () => fetchBrand(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

export function useUpdateBrand(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: (patch: BrandPatch) => apiUpdateBrand(productId, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          brand: { ...prev.brand, ...patch } as BrandName,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateCandidate(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: (name: string) => apiCreateCandidate(productId, name),
    onSuccess: (candidate) => {
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          names: [...prev.names, candidate],
        });
      } else {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateCandidate(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: ({ candidateId, patch }: { candidateId: number; patch: CandidatePatch }) =>
      apiUpdateCandidate(productId, candidateId, patch),
    onMutate: async ({ candidateId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          names: prev.names.map(n =>
            n.id === candidateId ? ({ ...n, ...patch } as BrandCandidate) : n,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteCandidate(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: (candidateId: number) => apiDeleteCandidate(productId, candidateId),
    onMutate: async (candidateId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          names: prev.names.filter(n => n.id !== candidateId),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
