import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProductDocTopics, createProductDocTopic, renameProductDocTopic,
  reorderProductDocTopics, deleteProductDocTopic,
} from '../../api/amazon.api';

export const productDocTopicsKey = (productId: number) =>
  ['amazon', 'product-doc-topics', productId] as const;

export function useProductDocTopics(productId: number) {
  return useQuery({
    queryKey: productDocTopicsKey(productId),
    queryFn: () => fetchProductDocTopics(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

function useInvalidateTopics(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: productDocTopicsKey(productId) });
}

export function useCreateProductDocTopic(productId: number) {
  const inv = useInvalidateTopics(productId);
  return useMutation({
    mutationFn: (name?: string) => createProductDocTopic(productId, name),
    onSettled: inv,
  });
}
export function useRenameProductDocTopic(productId: number) {
  const inv = useInvalidateTopics(productId);
  return useMutation({
    mutationFn: ({ topicId, name }: { topicId: number; name: string }) => renameProductDocTopic(productId, topicId, name),
    onSettled: inv,
  });
}
export function useReorderProductDocTopics(productId: number) {
  const inv = useInvalidateTopics(productId);
  return useMutation({
    mutationFn: (order: number[]) => reorderProductDocTopics(productId, order),
    onSettled: inv,
  });
}
export function useDeleteProductDocTopic(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicId: number) => deleteProductDocTopic(productId, topicId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: productDocTopicsKey(productId) });
      // Auch die Doc-Queries des geloeschten Topics invalidieren (breit per predicate).
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'amazon' && q.queryKey[1] === 'product-docs' && q.queryKey[2] === productId,
      });
    },
  });
}
