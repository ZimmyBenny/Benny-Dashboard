import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProductDocs, uploadProductDoc, deleteProductDoc,
  reorderProductDocs, updateProductDocNotes, updateProductDocFinal,
  type ProductDocArea,
} from '../../api/amazon.api';

export const productDocsKey = (productId: number, area: ProductDocArea) =>
  ['amazon', 'product-docs', productId, area] as const;

export function useProductDocs(productId: number, area: ProductDocArea) {
  return useQuery({
    queryKey: productDocsKey(productId, area),
    queryFn: () => fetchProductDocs(productId, area),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

function useInvalidate(productId: number, area: ProductDocArea) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: productDocsKey(productId, area) });
}

// Akzeptiert entweder eine reine File (→ Arbeitsdatei) oder { file, isFinal }
// fuer gezieltes Hochladen in die Finale-Gruppe (z. B. Drop direkt auf „Finale Dateien").
type UploadArg = File | { file: File; isFinal: 0 | 1 };
export function useUploadProductDoc(productId: number, area: ProductDocArea) {
  const inv = useInvalidate(productId, area);
  return useMutation({
    mutationFn: (arg: UploadArg) => {
      const file = arg instanceof File ? arg : arg.file;
      const isFinal = arg instanceof File ? 0 : arg.isFinal;
      return uploadProductDoc(productId, area, file, isFinal);
    },
    onSettled: inv,
  });
}
export function useDeleteProductDoc(productId: number, area: ProductDocArea) {
  const inv = useInvalidate(productId, area);
  return useMutation({ mutationFn: (fileId: number) => deleteProductDoc(productId, area, fileId), onSettled: inv });
}
export function useReorderProductDocs(productId: number, area: ProductDocArea) {
  const inv = useInvalidate(productId, area);
  return useMutation({ mutationFn: (order: number[]) => reorderProductDocs(productId, area, order), onSettled: inv });
}
export function useUpdateProductDocNotes(productId: number, area: ProductDocArea) {
  const inv = useInvalidate(productId, area);
  return useMutation({ mutationFn: (notes: string) => updateProductDocNotes(productId, area, notes), onSettled: inv });
}
// Verschiebt eine Datei zwischen Arbeits- und Finale-Gruppe und invalidiert die Docs-Query.
export function useUpdateProductDocFinal(productId: number, area: ProductDocArea) {
  const inv = useInvalidate(productId, area);
  return useMutation({
    mutationFn: ({ fileId, isFinal }: { fileId: number; isFinal: 0 | 1 }) =>
      updateProductDocFinal(productId, area, fileId, isFinal),
    onSettled: inv,
  });
}
