import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type Sourcing, type SourcingPatch, type SourcingPayload,
  type SourcingSample, type SamplePatch,
  fetchSourcing, updateSourcing as apiUpdateSourcing,
  createSample as apiCreateSample,
  updateSample as apiUpdateSample,
  deleteSample as apiDeleteSample,
} from '../../api/amazon.api';

export const sourcingKey = (productId: number) =>
  ['amazon', 'products', productId, 'sourcing'] as const;

export function useSourcing(productId: number) {
  return useQuery({
    queryKey: sourcingKey(productId),
    queryFn: () => fetchSourcing(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

export function useUpdateSourcing(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: (patch: SourcingPatch) => apiUpdateSourcing(productId, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        qc.setQueryData<SourcingPayload>(key, {
          ...prev,
          sourcing: { ...prev.sourcing, ...patch } as Sourcing,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateSample(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: () => apiCreateSample(productId),
    onSuccess: (sample) => {
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        qc.setQueryData<SourcingPayload>(key, {
          ...prev,
          samples: [...prev.samples, sample],
        });
      } else {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateSample(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: ({ sampleId, patch }: { sampleId: number; patch: SamplePatch }) =>
      apiUpdateSample(productId, sampleId, patch),
    onMutate: async ({ sampleId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        const winnerExclusive = patch.is_winner === 1;
        const updatedSamples: SourcingSample[] = prev.samples.map(s => {
          if (s.id === sampleId) return { ...s, ...patch } as SourcingSample;
          if (winnerExclusive) return { ...s, is_winner: 0 };
          return s;
        });
        qc.setQueryData<SourcingPayload>(key, { ...prev, samples: updatedSamples });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteSample(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: (sampleId: number) => apiDeleteSample(productId, sampleId),
    onMutate: async (sampleId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        qc.setQueryData<SourcingPayload>(key, {
          ...prev,
          samples: prev.samples.filter(s => s.id !== sampleId),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
