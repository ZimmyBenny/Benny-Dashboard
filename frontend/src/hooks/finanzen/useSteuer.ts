import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type SteuerItemPatch,
  fetchSteuerJahre, fetchSteuer,
  createSteuerCategory, updateSteuerCategory, deleteSteuerCategory, reorderSteuerCategories,
  createSteuerItem, updateSteuerItem, deleteSteuerItem, reorderSteuerItems,
  uploadSteuerFile, deleteSteuerFile, copySteuerYear,
} from '../../api/steuer.api';

export const steuerJahreKey = ['steuer', 'jahre'] as const;
export const steuerKey = (jahr: number) => ['steuer', 'jahr', jahr] as const;

export function useSteuerJahre() { return useQuery({ queryKey: steuerJahreKey, queryFn: fetchSteuerJahre }); }
export function useSteuer(jahr: number) {
  return useQuery({ queryKey: steuerKey(jahr), queryFn: () => fetchSteuer(jahr), enabled: Number.isInteger(jahr) && jahr > 0 });
}
function useInval(jahr: number) {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: steuerKey(jahr) }); qc.invalidateQueries({ queryKey: steuerJahreKey }); };
}
export function useCreateSteuerCategory(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (name?: string) => createSteuerCategory(jahr, name), onSettled: inval }); }
export function useUpdateSteuerCategory(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => updateSteuerCategory(id, name), onSettled: inval }); }
export function useDeleteSteuerCategory(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (id: number) => deleteSteuerCategory(id), onSettled: inval }); }
export function useReorderSteuerCategories(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (order: number[]) => reorderSteuerCategories(jahr, order), onSettled: inval }); }
export function useCreateSteuerItem(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (categoryId: number) => createSteuerItem(categoryId), onSettled: inval }); }
export function useUpdateSteuerItem(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ id, patch }: { id: number; patch: SteuerItemPatch }) => updateSteuerItem(id, patch), onSettled: inval }); }
export function useDeleteSteuerItem(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (id: number) => deleteSteuerItem(id), onSettled: inval }); }
export function useReorderSteuerItems(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ categoryId, order }: { categoryId: number; order: number[] }) => reorderSteuerItems(categoryId, order), onSettled: inval }); }
export function useUploadSteuerFile(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ itemId, file }: { itemId: number; file: File }) => uploadSteuerFile(itemId, file), onSettled: inval }); }
export function useDeleteSteuerFile(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ itemId, fId }: { itemId: number; fId: number }) => deleteSteuerFile(itemId, fId), onSettled: inval }); }
export function useCopySteuerYear(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ fromJahr, toJahr }: { fromJahr: number; toJahr: number }) => copySteuerYear(fromJahr, toJahr), onSettled: inval }); }
