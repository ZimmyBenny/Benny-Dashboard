import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ChecklistPayload, type ChecklistSectionPatch, type ChecklistItemPatch, type ChecklistItemCreate,
  type ChecklistItem, type ChecklistSection,
  fetchChecklistProduct,
  createProductSection as apiCreateSection,
  updateProductSection as apiUpdateSection,
  deleteProductSection as apiDeleteSection,
  createProductItem as apiCreateItem,
  updateProductItem as apiUpdateItem,
  deleteProductItem as apiDeleteItem,
} from '../../api/amazon.api';

export const productChecklistKey = (productId: number) =>
  ['amazon', 'products', productId, 'checklist'] as const;

export function useChecklistProduct(productId: number) {
  return useQuery({
    queryKey: productChecklistKey(productId),
    queryFn: () => fetchChecklistProduct(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

export function useCreateProductSection(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: (title: string) => apiCreateSection(productId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateProductSection(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: ({ sectionId, patch }: { sectionId: number; patch: ChecklistSectionPatch }) =>
      apiUpdateSection(productId, sectionId, patch),
    onMutate: async ({ sectionId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.map(s => s.id === sectionId ? ({ ...s, ...patch } as ChecklistSection) : s),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteProductSection(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: (sectionId: number) => apiDeleteSection(productId, sectionId),
    onMutate: async (sectionId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.filter(s => s.id !== sectionId),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateProductItem(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: number; input: ChecklistItemCreate }) =>
      apiCreateItem(productId, sectionId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateProductItem(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: number; patch: ChecklistItemPatch }) =>
      apiUpdateItem(productId, itemId, patch),
    onMutate: async ({ itemId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.map(i => i.id === itemId ? ({ ...i, ...patch } as ChecklistItem) : i),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteProductItem(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: (itemId: number) => apiDeleteItem(productId, itemId),
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.filter(i => i.id !== itemId),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
