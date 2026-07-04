import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchResearchTopics, createResearchTopic, updateResearchTopic, deleteResearchTopic, reorderResearchTopics,
  createResearchCard, updateResearchCard, deleteResearchCard, reorderResearchCards,
  createResearchLink, deleteResearchLink, uploadResearchImage, deleteResearchImage,
  type ResearchScope,
} from '../../api/amazon.api';

// Query-Key je Scope: globaler Bereich vs. konkretes Produkt.
export const researchKey = (scope: ResearchScope) =>
  (scope === 'global'
    ? ['amazon', 'research', 'global'] as const
    : ['amazon', 'products', scope, 'research'] as const);

export function useResearchTopics(scope: ResearchScope) {
  return useQuery({
    queryKey: researchKey(scope),
    queryFn: () => fetchResearchTopics(scope),
    enabled: scope === 'global' || (Number.isInteger(scope) && scope > 0),
  });
}

function useInvalidate(scope: ResearchScope) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: researchKey(scope) });
}

export function useCreateTopic(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (title: string) => createResearchTopic(scope, title), onSettled: inv });
}
export function useUpdateTopic(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (v: { topicId: number; patch: Partial<{ title: string; is_expanded: 0 | 1 }> }) => updateResearchTopic(scope, v.topicId, v.patch), onSettled: inv });
}
export function useDeleteTopic(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (topicId: number) => deleteResearchTopic(scope, topicId), onSettled: inv });
}
export function useReorderTopics(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (order: number[]) => reorderResearchTopics(scope, order), onSettled: inv });
}

export function useCreateCard(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (topicId: number) => createResearchCard(scope, topicId), onSettled: inv });
}
export function useUpdateCard(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (v: { cardId: number; patch: Partial<{ title: string | null; body: string; is_global: 0 | 1 }> }) => updateResearchCard(scope, v.cardId, v.patch), onSettled: inv });
}
export function useDeleteCard(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (cardId: number) => deleteResearchCard(scope, cardId), onSettled: inv });
}
export function useReorderCards(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (v: { topicId: number; order: number[] }) => reorderResearchCards(scope, v.topicId, v.order), onSettled: inv });
}

export function useCreateLink(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (v: { cardId: number; url: string; label: string | null }) => createResearchLink(scope, v.cardId, v.url, v.label), onSettled: inv });
}
export function useDeleteLink(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (linkId: number) => deleteResearchLink(scope, linkId), onSettled: inv });
}
export function useUploadImage(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (v: { cardId: number; file: File }) => uploadResearchImage(scope, v.cardId, v.file), onSettled: inv });
}
export function useDeleteImage(scope: ResearchScope) {
  const inv = useInvalidate(scope);
  return useMutation({ mutationFn: (imageId: number) => deleteResearchImage(scope, imageId), onSettled: inv });
}
