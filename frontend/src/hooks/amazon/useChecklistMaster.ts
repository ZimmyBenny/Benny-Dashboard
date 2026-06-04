import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ChecklistPayload, type ChecklistSectionPatch, type ChecklistItemPatch, type ChecklistItemCreate,
  type ChecklistItem, type ChecklistSection,
  fetchChecklistMaster,
  createMasterSection as apiCreateSection,
  updateMasterSection as apiUpdateSection,
  deleteMasterSection as apiDeleteSection,
  createMasterItem as apiCreateItem,
  updateMasterItem as apiUpdateItem,
  deleteMasterItem as apiDeleteItem,
} from '../../api/amazon.api';

export const masterKey = ['amazon', 'checklist', 'master'] as const;

export function useChecklistMaster() {
  return useQuery({
    queryKey: masterKey,
    queryFn: fetchChecklistMaster,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: masterKey });
}

export function useCreateMasterSection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (title: string) => apiCreateSection(title),
    onSuccess: invalidate,
  });
}

export function useUpdateMasterSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ChecklistSectionPatch }) => apiUpdateSection(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.map(s => s.id === id ? ({ ...s, ...patch } as ChecklistSection) : s),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}

export function useDeleteMasterSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDeleteSection(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.filter(s => s.id !== id),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}

export function useCreateMasterItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: number; input: ChecklistItemCreate }) =>
      apiCreateItem(sectionId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateMasterItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ChecklistItemPatch }) => apiUpdateItem(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.map(i => i.id === id ? ({ ...i, ...patch } as ChecklistItem) : i),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}

export function useDeleteMasterItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDeleteItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.filter(i => i.id !== id),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}
