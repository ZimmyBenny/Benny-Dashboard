import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchKeywordSources, createKeywordSource, importCompetitorsAsSources, updateKeywordSource, deleteKeywordSource,
  fetchKeywords, addKeyword, addKeywordsBulk, updateKeyword, deleteKeyword, importHelium10,
  type KeywordSourcePatch, type KeywordPatch, type Helium10ImportRow,
} from '../../api/amazon.keywords.api';

export const keywordSourcesKey = (productId: number) => ['amazon', 'products', productId, 'keyword-sources'] as const;
export const keywordsKey = (productId: number) => ['amazon', 'products', productId, 'keywords'] as const;

// ── Quellen ──
export function useKeywordSources(productId: number) {
  return useQuery({
    queryKey: keywordSourcesKey(productId),
    queryFn: () => fetchKeywordSources(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}
function useInvalidateSources(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keywordSourcesKey(productId) });
}
export function useCreateKeywordSource(productId: number) {
  const inv = useInvalidateSources(productId);
  return useMutation({ mutationFn: () => createKeywordSource(productId), onSettled: inv });
}
export function useImportCompetitorsAsSources(productId: number) {
  const inv = useInvalidateSources(productId);
  return useMutation({ mutationFn: () => importCompetitorsAsSources(productId), onSettled: inv });
}
export function useUpdateKeywordSource(productId: number) {
  const inv = useInvalidateSources(productId);
  return useMutation({ mutationFn: (v: { sid: number; patch: KeywordSourcePatch }) => updateKeywordSource(productId, v.sid, v.patch), onSettled: inv });
}
export function useDeleteKeywordSource(productId: number) {
  const inv = useInvalidateSources(productId);
  return useMutation({ mutationFn: (sid: number) => deleteKeywordSource(productId, sid), onSettled: inv });
}

// ── Keywords ──
export function useKeywords(productId: number) {
  return useQuery({
    queryKey: keywordsKey(productId),
    queryFn: () => fetchKeywords(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}
function useInvalidateKeywords(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keywordsKey(productId) });
}
export function useAddKeyword(productId: number) {
  const inv = useInvalidateKeywords(productId);
  return useMutation({ mutationFn: (v: { phrase: string; source?: string }) => addKeyword(productId, v.phrase, v.source ?? ''), onSettled: inv });
}
export function useAddKeywordsBulk(productId: number) {
  const inv = useInvalidateKeywords(productId);
  return useMutation({ mutationFn: (v: { text: string; source?: string }) => addKeywordsBulk(productId, v.text, v.source ?? ''), onSettled: inv });
}
export function useUpdateKeyword(productId: number) {
  const inv = useInvalidateKeywords(productId);
  return useMutation({ mutationFn: (v: { kid: number; patch: KeywordPatch }) => updateKeyword(productId, v.kid, v.patch), onSettled: inv });
}
export function useImportHelium10(productId: number) {
  const inv = useInvalidateKeywords(productId);
  return useMutation({
    mutationFn: (v: { sourceLabel: string; minVolume: number; rows: Helium10ImportRow[] }) =>
      importHelium10(productId, v.sourceLabel, v.minVolume, v.rows),
    onSettled: inv,
  });
}
export function useDeleteKeyword(productId: number) {
  const inv = useInvalidateKeywords(productId);
  return useMutation({ mutationFn: (kid: number) => deleteKeyword(productId, kid), onSettled: inv });
}
