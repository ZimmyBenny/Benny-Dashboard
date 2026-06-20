import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSampleInspection, saveInspectionResult, saveInspectionNotes,
  type InspectionStatus,
} from '../../api/amazon.api';

function key(sampleId: number) {
  return ['amazon', 'sample-inspection', sampleId] as const;
}

export function useSampleInspection(productId: number, mId: number, sampleId: number) {
  return useQuery({
    queryKey: key(sampleId),
    queryFn: () => fetchSampleInspection(productId, mId, sampleId),
  });
}

export function useSaveInspectionResult(productId: number, mId: number, sampleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pointId, status, note }: { pointId: number; status: InspectionStatus; note: string | null }) =>
      saveInspectionResult(productId, mId, sampleId, pointId, status, note),
    onSettled: () => qc.invalidateQueries({ queryKey: key(sampleId) }),
  });
}

export function useSaveInspectionNotes(productId: number, mId: number, sampleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string | null) => saveInspectionNotes(productId, mId, sampleId, notes),
    onSettled: () => qc.invalidateQueries({ queryKey: key(sampleId) }),
  });
}
