import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProductDocs, uploadProductDoc, deleteProductDoc,
  reorderProductDocs, updateProductDocNotes, moveProductDoc, moveProductDocToTopic,
} from '../../api/amazon.api';

export const productDocsKey = (productId: number, topicId: number) =>
  ['amazon', 'product-docs', productId, topicId] as const;
// Produkt-weiter Prefix: invalidiert ALLE Topics eines Produkts (fuer Cross-Topic-Move,
// damit Quell- UND Ziel-Sektion neu laden).
export const productDocsProductKey = (productId: number) =>
  ['amazon', 'product-docs', productId] as const;

export function useProductDocs(productId: number, topicId: number) {
  return useQuery({
    queryKey: productDocsKey(productId, topicId),
    queryFn: () => fetchProductDocs(productId, topicId),
    enabled: Number.isInteger(productId) && productId > 0 && Number.isInteger(topicId) && topicId > 0,
  });
}

function useInvalidate(productId: number, topicId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: productDocsKey(productId, topicId) });
}

// Akzeptiert entweder eine reine File (→ Arbeitsdatei) oder { file, isFinal, manufacturerId }
// fuer gezieltes Hochladen in einen Final-Reiter (z. B. Drop direkt auf einen Bucket).
type UploadArg = File | { file: File; isFinal: 0 | 1; manufacturerId?: number | null };
export function useUploadProductDoc(productId: number, topicId: number) {
  const inv = useInvalidate(productId, topicId);
  return useMutation({
    mutationFn: (arg: UploadArg) => {
      const file = arg instanceof File ? arg : arg.file;
      const isFinal = arg instanceof File ? 0 : arg.isFinal;
      const mfrId = arg instanceof File ? null : (arg.manufacturerId ?? null);
      return uploadProductDoc(productId, topicId, file, isFinal, mfrId);
    },
    onSettled: inv,
  });
}
export function useDeleteProductDoc(productId: number, topicId: number) {
  const inv = useInvalidate(productId, topicId);
  return useMutation({ mutationFn: (fileId: number) => deleteProductDoc(productId, topicId, fileId), onSettled: inv });
}
export function useReorderProductDocs(productId: number, topicId: number) {
  const inv = useInvalidate(productId, topicId);
  return useMutation({ mutationFn: (order: number[]) => reorderProductDocs(productId, topicId, order), onSettled: inv });
}
// Notiz pro Bucket speichern (bucket=0 → Allgemein, sonst Hersteller-ID).
export function useUpdateProductDocNotes(productId: number, topicId: number) {
  const inv = useInvalidate(productId, topicId);
  return useMutation({
    mutationFn: ({ bucket, notes }: { bucket: number; notes: string }) =>
      updateProductDocNotes(productId, topicId, bucket, notes),
    onSettled: inv,
  });
}
// Verschiebt eine Datei zwischen Arbeit/Final und weist beim Verschieben nach Final
// den Ziel-Bucket zu (manufacturer_id = Hersteller-ID oder null fuer Allgemein).
export function useMoveProductDoc(productId: number, topicId: number) {
  const inv = useInvalidate(productId, topicId);
  return useMutation({
    mutationFn: ({ fileId, isFinal, manufacturerId }: { fileId: number; isFinal: 0 | 1; manufacturerId?: number | null }) =>
      moveProductDoc(productId, topicId, fileId, { is_final: isFinal, manufacturer_id: manufacturerId }),
    onSettled: inv,
  });
}
// Cross-Topic-Move: verschiebt eine Datei aus einem Quell-Topic in einen anderen Ziel-Topic.
// Invalidiert den produkt-weiten Prefix, damit BEIDE betroffenen Sektionen neu laden.
export function useMoveProductDocToTopic(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceTopicId, fileId, targetTopicId, isFinal, manufacturerId }: {
      sourceTopicId: number; fileId: number; targetTopicId: number;
      isFinal?: 0 | 1; manufacturerId?: number | null;
    }) =>
      moveProductDocToTopic(productId, sourceTopicId, fileId, {
        topic_id: targetTopicId, is_final: isFinal, manufacturer_id: manufacturerId,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: productDocsProductKey(productId) }),
  });
}
