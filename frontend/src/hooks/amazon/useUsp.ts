import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsp, updateUspMeta, createUspPoint, updateUspPoint, deleteUspPoint, reorderUspPoints,
  uploadUspPointImage, deleteUspPointImage, reorderUspPointImages,
  createUspManufacturer, updateUspManufacturer, deleteUspManufacturer, reorderUspManufacturers,
  setUspFeasibility, uploadUspLogo, deleteUspLogo,
  createUspPointQuestion, updateUspPointQuestion, deleteUspPointQuestion,
  createUspKaufgrund, updateUspKaufgrund, deleteUspKaufgrund, reorderUspKaufgruende,
  uploadUspFile, deleteUspFile,
  fetchUspVersions, saveUspVersion, deleteUspVersion,
  type UspMetaPatch, type UspPointPatch, type UspManufacturerPatch, type UspFeasibilityStatus,
} from '../../api/amazon.api';

function key(productId: number) { return ['amazon', 'products', productId, 'usp'] as const; }

export function useUsp(productId: number) {
  return useQuery({ queryKey: key(productId), queryFn: () => fetchUsp(productId) });
}
function inval(productId: number, qc: ReturnType<typeof useQueryClient>) {
  return () => qc.invalidateQueries({ queryKey: key(productId) });
}

export function useUpdateUspMeta(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (patch: UspMetaPatch) => updateUspMeta(productId, patch), onSettled: inval(productId, qc) });
}
export function useCreateUspPointQuestion(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, text }: { pointId: number; text?: string }) => createUspPointQuestion(productId, pointId, text), onSettled: inval(productId, qc) });
}
export function useUpdateUspPointQuestion(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, qId, text }: { pointId: number; qId: number; text: string }) => updateUspPointQuestion(productId, pointId, qId, text), onSettled: inval(productId, qc) });
}
export function useDeleteUspPointQuestion(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, qId }: { pointId: number; qId: number }) => deleteUspPointQuestion(productId, pointId, qId), onSettled: inval(productId, qc) });
}
export function useUploadUspLogo(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (file: File) => uploadUspLogo(productId, file), onSettled: inval(productId, qc) });
}
export function useDeleteUspLogo(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => deleteUspLogo(productId), onSettled: inval(productId, qc) });
}
export function useCreateUspPoint(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (title?: string) => createUspPoint(productId, title), onSettled: inval(productId, qc) });
}
export function useUpdateUspPoint(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, patch }: { pointId: number; patch: UspPointPatch }) => updateUspPoint(productId, pointId, patch), onSettled: inval(productId, qc) });
}
export function useDeleteUspPoint(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (pointId: number) => deleteUspPoint(productId, pointId), onSettled: inval(productId, qc) });
}
export function useReorderUspPoints(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (order: number[]) => reorderUspPoints(productId, order), onSettled: inval(productId, qc) });
}
export function useUploadUspPointImage(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, file }: { pointId: number; file: File }) => uploadUspPointImage(productId, pointId, file), onSettled: inval(productId, qc) });
}
export function useDeleteUspPointImage(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, imageId }: { pointId: number; imageId: number }) => deleteUspPointImage(productId, pointId, imageId), onSettled: inval(productId, qc) });
}
export function useReorderUspPointImages(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, order }: { pointId: number; order: number[] }) => reorderUspPointImages(productId, pointId, order), onSettled: inval(productId, qc) });
}
export function useCreateUspManufacturer(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name?: string) => createUspManufacturer(productId, name), onSettled: inval(productId, qc) });
}
export function useUpdateUspManufacturer(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ mId, patch }: { mId: number; patch: UspManufacturerPatch }) => updateUspManufacturer(productId, mId, patch), onSettled: inval(productId, qc) });
}
export function useDeleteUspManufacturer(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (mId: number) => deleteUspManufacturer(productId, mId), onSettled: inval(productId, qc) });
}
export function useReorderUspManufacturers(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (order: number[]) => reorderUspManufacturers(productId, order), onSettled: inval(productId, qc) });
}
export function useSetUspFeasibility(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { point_id: number; manufacturer_id: number; status?: UspFeasibilityStatus; note?: string | null }) => setUspFeasibility(productId, input),
    onSettled: inval(productId, qc),
  });
}

function versionsKey(productId: number) { return ['amazon', 'products', productId, 'usp', 'versions'] as const; }

export function useUspVersions(productId: number) {
  return useQuery({ queryKey: versionsKey(productId), queryFn: () => fetchUspVersions(productId) });
}
export function useSaveUspVersion(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ manufacturerName, blob }: { manufacturerName: string; blob: Blob }) => saveUspVersion(productId, manufacturerName, blob),
    onSettled: () => qc.invalidateQueries({ queryKey: versionsKey(productId) }),
  });
}
export function useDeleteUspVersion(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vId: number) => deleteUspVersion(productId, vId),
    onSettled: () => qc.invalidateQueries({ queryKey: versionsKey(productId) }),
  });
}

export function useCreateUspKaufgrund(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (text?: string) => createUspKaufgrund(productId, text), onSettled: inval(productId, qc) });
}
export function useUpdateUspKaufgrund(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ kId, text }: { kId: number; text: string }) => updateUspKaufgrund(productId, kId, text), onSettled: inval(productId, qc) });
}
export function useDeleteUspKaufgrund(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (kId: number) => deleteUspKaufgrund(productId, kId), onSettled: inval(productId, qc) });
}
export function useReorderUspKaufgruende(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (order: number[]) => reorderUspKaufgruende(productId, order), onSettled: inval(productId, qc) });
}
export function useUploadUspFile(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (file: File) => uploadUspFile(productId, file), onSettled: inval(productId, qc) });
}
export function useDeleteUspFile(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (fId: number) => deleteUspFile(productId, fId), onSettled: inval(productId, qc) });
}
