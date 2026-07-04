import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchResearchTopics, createResearchTopic, updateResearchTopic, deleteResearchTopic, reorderResearchTopics,
  createResearchCard, updateResearchCard, deleteResearchCard, reorderResearchCards,
  createResearchLink, deleteResearchLink, uploadResearchImage, deleteResearchImage,
} from '../../api/amazon.api';

export const researchKey = (productId: number) => ['amazon', 'products', productId, 'research'] as const;

export function useResearchTopics(productId: number) {
  return useQuery({
    queryKey: researchKey(productId),
    queryFn: () => fetchResearchTopics(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

function useInvalidate(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: researchKey(productId) });
}

export function useCreateTopic(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (title: string) => createResearchTopic(productId, title), onSettled: inv });
}
export function useUpdateTopic(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { topicId: number; patch: Partial<{ title: string; is_expanded: 0 | 1 }> }) => updateResearchTopic(productId, v.topicId, v.patch), onSettled: inv });
}
export function useDeleteTopic(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (topicId: number) => deleteResearchTopic(productId, topicId), onSettled: inv });
}
export function useReorderTopics(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (order: number[]) => reorderResearchTopics(productId, order), onSettled: inv });
}

export function useCreateCard(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (topicId: number) => createResearchCard(productId, topicId), onSettled: inv });
}
export function useUpdateCard(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cardId: number; patch: Partial<{ title: string | null; body: string; is_global: 0 | 1 }> }) => updateResearchCard(productId, v.cardId, v.patch), onSettled: inv });
}
export function useDeleteCard(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (cardId: number) => deleteResearchCard(productId, cardId), onSettled: inv });
}
export function useReorderCards(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { topicId: number; order: number[] }) => reorderResearchCards(productId, v.topicId, v.order), onSettled: inv });
}

export function useCreateLink(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cardId: number; url: string; label: string | null }) => createResearchLink(productId, v.cardId, v.url, v.label), onSettled: inv });
}
export function useDeleteLink(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (linkId: number) => deleteResearchLink(productId, linkId), onSettled: inv });
}
export function useUploadImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cardId: number; file: File }) => uploadResearchImage(productId, v.cardId, v.file), onSettled: inv });
}
export function useDeleteImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (imageId: number) => deleteResearchImage(productId, imageId), onSettled: inv });
}
