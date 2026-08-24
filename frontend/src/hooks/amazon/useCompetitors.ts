import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCompetitors, createCompetitor, updateCompetitor, deleteCompetitor, reorderCompetitors,
  uploadCompetitorFile, deleteCompetitorFile, type CompetitorPatch,
} from '../../api/amazon.api';

export const competitorsKey = (productId: number) => ['amazon', 'products', productId, 'competitors'] as const;

export function useCompetitors(productId: number) {
  return useQuery({
    queryKey: competitorsKey(productId),
    queryFn: () => fetchCompetitors(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

function useInvalidate(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: competitorsKey(productId) });
}

export function useCreateCompetitor(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: () => createCompetitor(productId), onSettled: inv });
}
export function useUpdateCompetitor(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cid: number; patch: CompetitorPatch }) => updateCompetitor(productId, v.cid, v.patch), onSettled: inv });
}
export function useDeleteCompetitor(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (cid: number) => deleteCompetitor(productId, cid), onSettled: inv });
}
export function useReorderCompetitors(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (order: number[]) => reorderCompetitors(productId, order), onSettled: inv });
}
export function useUploadCompetitorFile(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cid: number; file: File }) => uploadCompetitorFile(productId, v.cid, v.file), onSettled: inv });
}
export function useDeleteCompetitorFile(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (fid: number) => deleteCompetitorFile(productId, fid), onSettled: inv });
}
