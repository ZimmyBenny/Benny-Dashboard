import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchListing, updateListing, uploadListingImage, deleteListingImage,
  reorderListingImages, updateListingImage,
  uploadListingOwnImage, deleteListingOwnImage,
  type ListingPatch, type ListingImageKind, type ListingImagePatch,
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
export function useUpdateListingImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { imageId: number; patch: ListingImagePatch }) => updateListingImage(productId, v.imageId, v.patch), onSettled: inv });
}
// Tausch-Bild der eigenen Karte (Migr. 109) — setzt/ersetzt bzw. loescht das Bild
// und invalidiert die Listing-Query, damit comp_own_image neu geladen wird.
export function useUploadListingOwnImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (file: File) => uploadListingOwnImage(productId, file), onSettled: inv });
}
export function useDeleteListingOwnImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: () => deleteListingOwnImage(productId), onSettled: inv });
}
