import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchListing, updateListing, uploadListingImage, deleteListingImage,
  reorderListingImages, updateListingImageLabel,
  type ListingPatch, type ListingImageKind,
} from '../../api/amazon.api';

export const listingKey = (productId: number) => ['amazon', 'products', productId, 'listing'] as const;

export function useListing(productId: number) {
  return useQuery({
    queryKey: listingKey(productId),
    queryFn: () => fetchListing(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

function useInvalidate(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: listingKey(productId) });
}

// KEIN optimistisches Feld-Rewrite — der Editor haelt lokalen State (wie ProductNotes),
// invalidate ist v.a. fuer Bild-Aenderungen relevant.
export function useUpdateListing(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (patch: ListingPatch) => updateListing(productId, patch), onSettled: inv });
}
export function useUploadListingImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { kind: ListingImageKind; file: File }) => uploadListingImage(productId, v.kind, v.file), onSettled: inv });
}
export function useDeleteListingImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (imageId: number) => deleteListingImage(productId, imageId), onSettled: inv });
}
export function useReorderListingImages(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { kind: ListingImageKind; order: number[] }) => reorderListingImages(productId, v.kind, v.order), onSettled: inv });
}
export function useUpdateListingImageLabel(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { imageId: number; label: string | null }) => updateListingImageLabel(productId, v.imageId, v.label), onSettled: inv });
}
