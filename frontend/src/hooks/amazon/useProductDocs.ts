import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProductDocs, uploadProductDoc, deleteProductDoc,
  reorderProductDocs, updateProductDocNotes,
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

export function useUploadProductDoc(productId: number, area: ProductDocArea) {
  const inv = useInvalidate(productId, area);
  return useMutation({ mutationFn: (file: File) => uploadProductDoc(productId, area, file), onSettled: inv });
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
