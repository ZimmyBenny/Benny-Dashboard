import apiClient from './client';

export type AmazonProductStatus = 'interessant' | 'warteliste' | 'aktiv' | 'bestehend' | 'verworfen';

export interface AmazonProduct {
  id: number;
  name: string;
  status: AmazonProductStatus;
  image_path: string | null;
  notes: string | null;
  created_at: number; // unix seconds
  updated_at: number;
}

export async function fetchAmazonProducts(includeDiscarded: boolean): Promise<AmazonProduct[]> {
  const r = await apiClient.get<AmazonProduct[]>('/amazon/products', {
    params: { include_discarded: includeDiscarded ? 'true' : 'false' },
  });
  return r.data;
}

export async function createAmazonProduct(name: string): Promise<AmazonProduct> {
  const r = await apiClient.post<AmazonProduct>('/amazon/products', { name });
  return r.data;
}

export async function updateAmazonProduct(
  id: number,
  patch: Partial<{ name: string; status: AmazonProductStatus; notes: string | null }>,
): Promise<AmazonProduct> {
  const r = await apiClient.patch<AmazonProduct>(`/amazon/products/${id}`, patch);
  return r.data;
}

export async function deleteAmazonProduct(id: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${id}`);
}

export async function uploadAmazonProductImage(id: number, file: File): Promise<{ image_path: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await apiClient.post<{ image_path: string }>(`/amazon/products/${id}/image`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data;
}

export async function deleteAmazonProductImage(id: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${id}/image`);
}

// Authentifizierte Bild-URL via fetch+blob fuer Verwendung in <img src>.
// Hintergrund: GET /:id/image braucht den Bearer-Token, also bauen wir eine Object-URL.
export async function getAmazonProductImageObjectUrl(id: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${id}/image`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}

// ── Sourcing ──────────────────────────────────────────────────────────────────

export type SourcingStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
export type SampleQuality = 'sehr_gut' | 'gut' | 'mittel' | 'schlecht';
export type SampleStatus = 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt';

export const SOURCING_CP_KEYS = [
  'cp_hersteller_gefiltert',
  'cp_anforderungen_kommuniziert',
  'cp_erste_preise_erhalten',
  'cp_usp_geprueft',
  'cp_samples_angefragt',
  'cp_sample_analyse',
  'cp_vergleichstabelle',
  'cp_finale_verhandlung',
  'cp_zahlungsziel',
] as const;
export type SourcingCpKey = typeof SOURCING_CP_KEYS[number];

export interface Sourcing {
  product_id: number;
  status: SourcingStatus;
  is_expanded: 0 | 1;
  cp_hersteller_gefiltert: 0 | 1;
  cp_anforderungen_kommuniziert: 0 | 1;
  cp_erste_preise_erhalten: 0 | 1;
  cp_usp_geprueft: 0 | 1;
  cp_samples_angefragt: 0 | 1;
  cp_sample_analyse: 0 | 1;
  cp_vergleichstabelle: 0 | 1;
  cp_finale_verhandlung: 0 | 1;
  cp_zahlungsziel: 0 | 1;
  updated_at: number;
}

export interface SourcingSample {
  id: number;
  product_id: number;
  sort_order: number;
  is_winner: 0 | 1;
  sample_ordered: 0 | 1;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  created_at: number;
  updated_at: number;
}

export interface SourcingPayload {
  sourcing: Sourcing;
  samples: SourcingSample[];
}

export type SourcingPatch = Partial<
  Pick<Sourcing, 'status' | 'is_expanded'>
  & Record<SourcingCpKey, 0 | 1>
>;

export type SamplePatch = Partial<{
  is_winner: 0 | 1;
  sample_ordered: 0 | 1;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  sort_order: number;
}>;

export async function fetchSourcing(productId: number): Promise<SourcingPayload> {
  const r = await apiClient.get<SourcingPayload>(`/amazon/products/${productId}/sourcing`);
  return r.data;
}

export async function updateSourcing(productId: number, patch: SourcingPatch): Promise<Sourcing> {
  const r = await apiClient.patch<{ sourcing: Sourcing }>(`/amazon/products/${productId}/sourcing`, patch);
  return r.data.sourcing;
}

export async function createSample(productId: number): Promise<SourcingSample> {
  const r = await apiClient.post<{ sample: SourcingSample }>(
    `/amazon/products/${productId}/sourcing/samples`,
    {},
  );
  return r.data.sample;
}

export async function updateSample(
  productId: number,
  sampleId: number,
  patch: SamplePatch,
): Promise<SourcingSample> {
  const r = await apiClient.patch<{ sample: SourcingSample }>(
    `/amazon/products/${productId}/sourcing/samples/${sampleId}`,
    patch,
  );
  return r.data.sample;
}

export async function deleteSample(productId: number, sampleId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/sourcing/samples/${sampleId}`);
}

// ── Brand-Sektion ─────────────────────────────────────────────────────────────

export type BrandStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
export type ResearchStatus = 'frei' | 'belegt' | 'unklar';

export interface BrandName {
  product_id: number;
  status: BrandStatus;
  is_expanded: 0 | 1;
  notes: string | null;
  updated_at: number;
}

export interface BrandCandidate {
  id: number;
  product_id: number;
  sort_order: number;
  name: string;
  is_interesting: 0 | 1;
  is_maybe: 0 | 1;
  is_yes: 0 | 1;
  is_no: 0 | 1;
  is_favorite: 0 | 1;
  is_archived: 0 | 1;
  is_final: 0 | 1;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_shop_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  tiktok_status: ResearchStatus | null;
  instagram_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  ranking: number | null;
  created_at: number;
  updated_at: number;
}

export interface BrandPayload {
  brand: BrandName;
  names: BrandCandidate[];
}

export type BrandPatch = Partial<Pick<BrandName, 'status' | 'is_expanded' | 'notes'>>;

export type CandidatePatch = Partial<{
  name: string;
  is_interesting: 0 | 1;
  is_maybe: 0 | 1;
  is_yes: 0 | 1;
  is_no: 0 | 1;
  is_favorite: 0 | 1;
  is_archived: 0 | 1;
  is_final: 0 | 1;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_shop_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  tiktok_status: ResearchStatus | null;
  instagram_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  ranking: number | null;
  sort_order: number;
}>;

export async function fetchBrand(productId: number): Promise<BrandPayload> {
  const r = await apiClient.get<BrandPayload>(`/amazon/products/${productId}/brand`);
  return r.data;
}

export async function updateBrand(productId: number, patch: BrandPatch): Promise<BrandName> {
  const r = await apiClient.patch<{ brand: BrandName }>(`/amazon/products/${productId}/brand`, patch);
  return r.data.brand;
}

export async function createCandidate(productId: number, name: string): Promise<BrandCandidate> {
  const r = await apiClient.post<{ name: BrandCandidate }>(
    `/amazon/products/${productId}/brand/names`,
    { name },
  );
  return r.data.name;
}

export async function updateCandidate(
  productId: number,
  candidateId: number,
  patch: CandidatePatch,
): Promise<BrandCandidate> {
  const r = await apiClient.patch<{ name: BrandCandidate }>(
    `/amazon/products/${productId}/brand/names/${candidateId}`,
    patch,
  );
  return r.data.name;
}

export async function deleteCandidate(productId: number, candidateId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/brand/names/${candidateId}`);
}

// ── Checkliste ────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: number;
  section_id: number;
  sort_order: number;
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  is_done: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface ChecklistSection {
  id: number;
  sort_order: number;
  title: string;
  items: ChecklistItem[];
  created_at: number;
  updated_at: number;
}

export interface ChecklistPayload {
  sections: ChecklistSection[];
}

export type ChecklistSectionPatch = Partial<{ title: string; sort_order: number }>;
export type ChecklistItemPatch = Partial<{
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  sort_order: number;
  is_done: 0 | 1;
}>;
export interface ChecklistItemCreate {
  description: string;
  remark?: string | null;
  link_url?: string | null;
  link_label?: string | null;
}

// Master
export async function fetchChecklistMaster(): Promise<ChecklistPayload> {
  const r = await apiClient.get<ChecklistPayload>('/amazon/checklist/master');
  return r.data;
}
export async function createMasterSection(title: string): Promise<ChecklistSection> {
  const r = await apiClient.post<{ section: ChecklistSection }>('/amazon/checklist/master/sections', { title });
  return r.data.section;
}
export async function updateMasterSection(id: number, patch: ChecklistSectionPatch): Promise<ChecklistSection> {
  const r = await apiClient.patch<{ section: ChecklistSection }>(`/amazon/checklist/master/sections/${id}`, patch);
  return r.data.section;
}
export async function deleteMasterSection(id: number): Promise<void> {
  await apiClient.delete(`/amazon/checklist/master/sections/${id}`);
}
export async function createMasterItem(sectionId: number, input: ChecklistItemCreate): Promise<ChecklistItem> {
  const r = await apiClient.post<{ item: ChecklistItem }>(`/amazon/checklist/master/sections/${sectionId}/items`, input);
  return r.data.item;
}
export async function updateMasterItem(id: number, patch: ChecklistItemPatch): Promise<ChecklistItem> {
  const r = await apiClient.patch<{ item: ChecklistItem }>(`/amazon/checklist/master/items/${id}`, patch);
  return r.data.item;
}
export async function deleteMasterItem(id: number): Promise<void> {
  await apiClient.delete(`/amazon/checklist/master/items/${id}`);
}

// Produkt
export async function fetchChecklistProduct(productId: number): Promise<ChecklistPayload> {
  const r = await apiClient.get<ChecklistPayload>(`/amazon/products/${productId}/checklist`);
  return r.data;
}
export async function createProductSection(productId: number, title: string): Promise<ChecklistSection> {
  const r = await apiClient.post<{ section: ChecklistSection }>(`/amazon/products/${productId}/checklist/sections`, { title });
  return r.data.section;
}
export async function updateProductSection(productId: number, sectionId: number, patch: ChecklistSectionPatch): Promise<ChecklistSection> {
  const r = await apiClient.patch<{ section: ChecklistSection }>(`/amazon/products/${productId}/checklist/sections/${sectionId}`, patch);
  return r.data.section;
}
export async function deleteProductSection(productId: number, sectionId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/checklist/sections/${sectionId}`);
}
export async function createProductItem(productId: number, sectionId: number, input: ChecklistItemCreate): Promise<ChecklistItem> {
  const r = await apiClient.post<{ item: ChecklistItem }>(`/amazon/products/${productId}/checklist/sections/${sectionId}/items`, input);
  return r.data.item;
}
export async function updateProductItem(productId: number, itemId: number, patch: ChecklistItemPatch): Promise<ChecklistItem> {
  const r = await apiClient.patch<{ item: ChecklistItem }>(`/amazon/products/${productId}/checklist/items/${itemId}`, patch);
  return r.data.item;
}
export async function deleteProductItem(productId: number, itemId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/checklist/items/${itemId}`);
}

// ── USP (Phase 1) ─────────────────────────────────────────────────────────────
export interface UspMeta { product_id: number; marke: string | null; hauptfokus: string | null; logo_path: string | null; status: SourcingStatus; bsp_amazon: string | null; bsp_alibaba: string | null; bsp_pinterest: string | null; differenzierung: string | null; updated_at: number; }
export interface UspPointImage { id: number; point_id: number; sort_order: number; file_path: string; created_at: number; }
export interface UspPointQuestion { id: number; point_id: number; sort_order: number; text: string; created_at: number; updated_at: number; }
export interface UspPoint { id: number; product_id: number; sort_order: number; title: string; body: string | null; created_at: number; updated_at: number; images: UspPointImage[]; questions: UspPointQuestion[]; }
export interface UspManufacturer { id: number; product_id: number; sort_order: number; name: string; ansprechpartner: string | null; datum: string | null; notes: string | null; manufacturer_id: number | null; created_at: number; updated_at: number; }
export type UspFeasibilityStatus = 'offen' | 'umsetzbar' | 'teilweise' | 'nicht';
export interface UspFeasibility { id: number; point_id: number; manufacturer_id: number; status: UspFeasibilityStatus; note: string | null; include_in_pdf: number; updated_at: number; }
export interface UspPayload { meta: UspMeta; points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[]; kaufgruende: UspKaufgrund[]; files: UspFile[]; final_marke: string | null; }
export type UspMetaPatch = Partial<Pick<UspMeta, 'marke' | 'hauptfokus' | 'status' | 'bsp_amazon' | 'bsp_alibaba' | 'bsp_pinterest' | 'differenzierung'>>;
export type UspPointPatch = Partial<Pick<UspPoint, 'title' | 'body'>>;
export type UspManufacturerPatch = Partial<Pick<UspManufacturer, 'name' | 'ansprechpartner' | 'datum' | 'notes'>>;

export async function fetchUsp(productId: number): Promise<UspPayload> {
  return (await apiClient.get(`/amazon/products/${productId}/usp`)).data as UspPayload;
}
export async function updateUspMeta(productId: number, patch: UspMetaPatch): Promise<UspMeta> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp`, patch)).data as { meta: UspMeta }).meta;
}
export async function createUspPoint(productId: number, title?: string): Promise<UspPoint> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points`, title !== undefined ? { title } : {})).data as { point: UspPoint }).point;
}
export async function updateUspPoint(productId: number, pointId: number, patch: UspPointPatch): Promise<UspPoint> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}`, patch)).data as { point: UspPoint }).point;
}
export async function deleteUspPoint(productId: number, pointId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}`);
}
export async function reorderUspPoints(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/points/reorder`, { order });
}
export async function uploadUspPointImage(productId: number, pointId: number, file: File): Promise<UspPointImage> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points/${pointId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { image: UspPointImage }).image;
}
export async function reorderUspPointImages(productId: number, pointId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}/images/reorder`, { order });
}
export async function deleteUspPointImage(productId: number, pointId: number, imageId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}/images/${imageId}`);
}
export async function addUspPointImageFromFile(productId: number, pointId: number, fileId: number): Promise<UspPointImage> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points/${pointId}/images/from-file`, { file_id: fileId })).data as { image: UspPointImage }).image;
}
export async function getUspImageObjectUrl(productId: number, imageId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/images/${imageId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function createUspPointQuestion(productId: number, pointId: number, text?: string): Promise<UspPointQuestion> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points/${pointId}/questions`, text !== undefined ? { text } : {})).data as { question: UspPointQuestion }).question;
}
export async function updateUspPointQuestion(productId: number, pointId: number, qId: number, text: string): Promise<UspPointQuestion> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}/questions/${qId}`, { text })).data as { question: UspPointQuestion }).question;
}
export async function deleteUspPointQuestion(productId: number, pointId: number, qId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}/questions/${qId}`);
}
export async function uploadUspLogo(productId: number, file: File): Promise<UspMeta> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/usp/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { meta: UspMeta }).meta;
}
export async function deleteUspLogo(productId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/logo`);
}
export async function getUspLogoObjectUrl(productId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/logo`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function createUspManufacturer(productId: number, name?: string): Promise<UspManufacturer> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/manufacturers`, name !== undefined ? { name } : {})).data as { manufacturer: UspManufacturer }).manufacturer;
}
export async function updateUspManufacturer(productId: number, mId: number, patch: UspManufacturerPatch): Promise<UspManufacturer> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/manufacturers/${mId}`, patch)).data as { manufacturer: UspManufacturer }).manufacturer;
}
export async function deleteUspManufacturer(productId: number, mId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/manufacturers/${mId}`);
}
export async function reorderUspManufacturers(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/manufacturers/reorder`, { order });
}
export async function uebernehmeUspManufacturer(productId: number, mId: number): Promise<{ manufacturer_id: number }> {
  return (await apiClient.post(`/amazon/products/${productId}/usp/manufacturers/${mId}/uebernehmen`, {})).data as { manufacturer_id: number };
}
export async function setUspFeasibility(
  productId: number,
  input: { point_id: number; manufacturer_id: number; status?: UspFeasibilityStatus; note?: string | null; include_in_pdf?: number },
): Promise<UspFeasibility> {
  return ((await apiClient.put(`/amazon/products/${productId}/usp/feasibility`, input)).data as { feasibility: UspFeasibility }).feasibility;
}

// ── USP Versions (Phase 2) ────────────────────────────────────────────────────
export interface UspVersion { id: number; product_id: number; manufacturer_name: string; created_at: number; }

export async function fetchUspVersions(productId: number): Promise<UspVersion[]> {
  return ((await apiClient.get(`/amazon/products/${productId}/usp/versions`)).data as { versions: UspVersion[] }).versions;
}
export async function saveUspVersion(productId: number, manufacturerName: string, blob: Blob): Promise<UspVersion> {
  const fd = new FormData();
  fd.append('manufacturer_name', manufacturerName);
  fd.append('file', blob, 'version.pdf');
  return ((await apiClient.post(`/amazon/products/${productId}/usp/versions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { version: UspVersion }).version;
}
export async function getUspVersionPdfObjectUrl(productId: number, vId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/versions/${vId}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function deleteUspVersion(productId: number, vId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/versions/${vId}`);
}

export interface UspKaufgrund { id: number; product_id: number; sort_order: number; text: string; created_at: number; updated_at: number; }
export interface UspFile { id: number; product_id: number; sort_order: number; file_path: string; original_name: string; mime: string; created_at: number; }

export async function createUspKaufgrund(productId: number, text?: string): Promise<UspKaufgrund> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/kaufgruende`, text !== undefined ? { text } : {})).data as { kaufgrund: UspKaufgrund }).kaufgrund;
}
export async function updateUspKaufgrund(productId: number, kId: number, text: string): Promise<UspKaufgrund> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/kaufgruende/${kId}`, { text })).data as { kaufgrund: UspKaufgrund }).kaufgrund;
}
export async function deleteUspKaufgrund(productId: number, kId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/kaufgruende/${kId}`);
}
export async function reorderUspKaufgruende(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/kaufgruende/reorder`, { order });
}
export async function uploadUspFile(productId: number, file: File): Promise<UspFile> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/usp/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { file: UspFile }).file;
}
export async function deleteUspFile(productId: number, fId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/files/${fId}`);
}
export async function getUspFileObjectUrl(productId: number, fId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/files/${fId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}

// ===== Amazon Hersteller =====
export interface OfferFile { id: number; offer_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
export interface ManufacturerOffer {
  id: number; manufacturer_id: number; sort_order: number;
  menge_variante: string | null; preis: string | null; moq: string | null;
  lieferzeit: string | null; datum: string | null; notiz: string | null;
  currency: 'USD' | 'EUR'; is_latest: number;
  created_at: number; updated_at: number;
  files: OfferFile[];
}
export interface Manufacturer {
  id: number; product_id: number; sort_order: number; name: string;
  ansprechpartner: string | null; adresse: string | null; email: string | null;
  webseite: string | null; notizen: string | null; created_at: number; updated_at: number;
  offers: ManufacturerOffer[];
  samples: ManufacturerSample[];
  machbarkeit: { umsetzbar: number; teilweise: number; nicht: number; offen: number; total: number } | null;
}
export interface ManufacturersPayload { manufacturers: Manufacturer[]; settings: { usd_eur_rate: string | null; rate_date: string | null }; }
export type ManufacturerPatch = Partial<Pick<Manufacturer, 'name' | 'ansprechpartner' | 'adresse' | 'email' | 'webseite' | 'notizen'>>;
export type OfferPatch = Partial<Pick<ManufacturerOffer, 'menge_variante' | 'preis' | 'moq' | 'lieferzeit' | 'datum' | 'notiz' | 'currency' | 'is_latest'>>;

export async function fetchManufacturers(productId: number): Promise<ManufacturersPayload> {
  return (await apiClient.get(`/amazon/products/${productId}/manufacturers`)).data as ManufacturersPayload;
}
export async function updateManufacturerSettings(productId: number, usdEurRate: string, rateDate?: string | null): Promise<{ usd_eur_rate: string | null; rate_date: string | null }> {
  const body = rateDate !== undefined ? { usd_eur_rate: usdEurRate, rate_date: rateDate } : { usd_eur_rate: usdEurRate };
  return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/settings`, body)).data as { settings: { usd_eur_rate: string | null; rate_date: string | null } }).settings;
}
export async function fetchEurUsdRate(): Promise<{ rate: number; date: string }> {
  return (await apiClient.get(`/amazon/fx/eur-usd`)).data as { rate: number; date: string };
}
export async function createManufacturer(productId: number, name?: string): Promise<Manufacturer> {
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers`, name !== undefined ? { name } : {})).data as { manufacturer: Manufacturer }).manufacturer;
}
export async function updateManufacturer(productId: number, mId: number, patch: ManufacturerPatch): Promise<Manufacturer> {
  return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}`, patch)).data as { manufacturer: Manufacturer }).manufacturer;
}
export async function deleteManufacturer(productId: number, mId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}`);
}
export async function reorderManufacturers(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/manufacturers/reorder`, { order });
}
export async function createOffer(productId: number, mId: number): Promise<ManufacturerOffer> {
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/offers`, {})).data as { offer: ManufacturerOffer }).offer;
}
export async function updateOffer(productId: number, mId: number, oId: number, patch: OfferPatch): Promise<ManufacturerOffer> {
  return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}`, patch)).data as { offer: ManufacturerOffer }).offer;
}
export async function deleteOffer(productId: number, mId: number, oId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}`);
}
export async function reorderOffers(productId: number, mId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/offers/reorder`, { order });
}
export async function uploadOfferFile(productId: number, mId: number, oId: number, file: File): Promise<OfferFile> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { file: OfferFile }).file;
}
export async function getOfferFileObjectUrl(productId: number, mId: number, oId: number, fId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}/files/${fId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function deleteOfferFile(productId: number, mId: number, oId: number, fId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}/files/${fId}`);
}

// ── Samples pro Hersteller ──
export interface SamplePhoto { id: number; sample_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
export interface ManufacturerSample {
  id: number; manufacturer_id: number; sort_order: number;
  bezeichnung: string; received_date: string | null; rating: number;
  status: 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt'; is_favorite: number;
  notizen: string | null; maengel: string | null; kosten: string | null; currency: 'USD' | 'EUR';
  sendungsnummer: string | null; link_url: string | null;
  created_at: number; updated_at: number; photos: SamplePhoto[];
  inspection_total: number; inspection_done: number;
}
export type SamplePatch = Partial<Pick<ManufacturerSample, 'bezeichnung' | 'received_date' | 'rating' | 'status' | 'is_favorite' | 'notizen' | 'maengel' | 'kosten' | 'currency' | 'sendungsnummer' | 'link_url'>>;

export async function createSampleM(productId: number, mId: number): Promise<ManufacturerSample> {
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/samples`, {})).data as { sample: ManufacturerSample }).sample;
}
export async function updateSampleM(productId: number, mId: number, sId: number, patch: SamplePatch): Promise<ManufacturerSample> {
  return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}`, patch)).data as { sample: ManufacturerSample }).sample;
}
export async function deleteSampleM(productId: number, mId: number, sId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}`);
}
export async function reorderSamplesM(productId: number, mId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/samples/reorder`, { order });
}
export async function uploadSamplePhoto(productId: number, mId: number, sId: number, file: File): Promise<SamplePhoto> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { photo: SamplePhoto }).photo;
}
export async function getSamplePhotoObjectUrl(productId: number, mId: number, sId: number, photoId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}/photos/${photoId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function deleteSamplePhoto(productId: number, mId: number, sId: number, photoId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}/photos/${photoId}`);
}

// ── Recherche & Wissen ──
export interface ResearchLink { id: number; card_id: number; sort_order: number; url: string; label: string | null; }
export interface ResearchImage { id: number; card_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; }
export interface ResearchCard { id: number; topic_id: number; sort_order: number; title: string | null; body: string; is_global: number; links: ResearchLink[]; images: ResearchImage[]; }
export interface ResearchTopic { id: number; product_id: number; sort_order: number; title: string; is_expanded: number; cards: ResearchCard[]; }

// Globale Recherche-Karte (produktuebergreifend, mit Herkunfts-Kontext)
export interface GlobalResearchCard extends ResearchCard { product_id: number; product_name: string; topic_title: string; }

// Scope einer Recherche: konkretes Produkt (number) ODER globaler Bereich ('global').
export type ResearchScope = number | 'global';

// Baut den Basis-Pfad je Scope:
//   number   -> /amazon/products/<id>/research   (Produkt-Recherche, unveraendert)
//   'global' -> /amazon/research/global          (produktunabhaengige Recherche)
function researchBase(scope: ResearchScope): string {
  return scope === 'global' ? '/amazon/research/global' : `/amazon/products/${scope}/research`;
}

export async function fetchResearchTopics(scope: ResearchScope): Promise<ResearchTopic[]> {
  const r = await apiClient.get<{ topics: ResearchTopic[] }>(`${researchBase(scope)}/topics`);
  return r.data.topics;
}
export async function createResearchTopic(scope: ResearchScope, title: string): Promise<ResearchTopic> {
  const r = await apiClient.post<{ topic: ResearchTopic }>(`${researchBase(scope)}/topics`, { title });
  return r.data.topic;
}
export async function updateResearchTopic(scope: ResearchScope, topicId: number, patch: Partial<{ title: string; is_expanded: 0 | 1 }>): Promise<ResearchTopic> {
  const r = await apiClient.patch<{ topic: ResearchTopic }>(`${researchBase(scope)}/topics/${topicId}`, patch);
  return r.data.topic;
}
export async function deleteResearchTopic(scope: ResearchScope, topicId: number): Promise<void> {
  await apiClient.delete(`${researchBase(scope)}/topics/${topicId}`);
}
export async function reorderResearchTopics(scope: ResearchScope, order: number[]): Promise<void> {
  await apiClient.post(`${researchBase(scope)}/topics/reorder`, { order });
}

export async function createResearchCard(scope: ResearchScope, topicId: number): Promise<ResearchCard> {
  const r = await apiClient.post<{ card: ResearchCard }>(`${researchBase(scope)}/topics/${topicId}/cards`, {});
  return r.data.card;
}
export async function updateResearchCard(scope: ResearchScope, cardId: number, patch: Partial<{ title: string | null; body: string; is_global: 0 | 1 }>): Promise<ResearchCard> {
  const r = await apiClient.patch<{ card: ResearchCard }>(`${researchBase(scope)}/cards/${cardId}`, patch);
  return r.data.card;
}
export async function fetchGlobalResearch(): Promise<GlobalResearchCard[]> {
  const r = await apiClient.get<{ cards: GlobalResearchCard[] }>(`/amazon/research/global/promoted`);
  return r.data.cards;
}
export async function deleteResearchCard(scope: ResearchScope, cardId: number): Promise<void> {
  await apiClient.delete(`${researchBase(scope)}/cards/${cardId}`);
}
export async function reorderResearchCards(scope: ResearchScope, topicId: number, order: number[]): Promise<void> {
  await apiClient.post(`${researchBase(scope)}/topics/${topicId}/cards/reorder`, { order });
}

export async function createResearchLink(scope: ResearchScope, cardId: number, url: string, label: string | null): Promise<ResearchLink> {
  const r = await apiClient.post<{ link: ResearchLink }>(`${researchBase(scope)}/cards/${cardId}/links`, { url, label });
  return r.data.link;
}
export async function deleteResearchLink(scope: ResearchScope, linkId: number): Promise<void> {
  await apiClient.delete(`${researchBase(scope)}/links/${linkId}`);
}

export async function uploadResearchImage(scope: ResearchScope, cardId: number, file: File): Promise<ResearchImage> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`${researchBase(scope)}/cards/${cardId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { image: ResearchImage }).image;
}
export async function deleteResearchImage(scope: ResearchScope, imageId: number): Promise<void> {
  await apiClient.delete(`${researchBase(scope)}/images/${imageId}`);
}
export async function getResearchImageObjectUrl(scope: ResearchScope, imageId: number): Promise<string> {
  const r = await apiClient.get(`${researchBase(scope)}/images/${imageId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}

// ── Meine Daten (Stammdaten + PIN) ──
export interface MyDataGroup { id: number; sort_order: number; title: string; created_at: number; }
export interface MyDataField { id: number; group_id: number | null; sort_order: number; label: string; value: string; created_at: number; }

export async function fetchMyDataStatus(): Promise<{ pinSet: boolean }> {
  return (await apiClient.get('/amazon/my-data/status')).data as { pinSet: boolean };
}
export async function setMyDataPin(pin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/set-pin', { pin })).data as { token: string };
}
export async function verifyMyDataPin(pin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/verify-pin', { pin })).data as { token: string };
}
export async function changeMyDataPin(oldPin: string, newPin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/change-pin', { oldPin, newPin })).data as { token: string };
}
export async function resetMyDataPin(password: string, newPin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/reset-pin', { password, newPin })).data as { token: string };
}
export async function fetchMyData(): Promise<{ groups: MyDataGroup[]; fields: MyDataField[] }> {
  return (await apiClient.get('/amazon/my-data')).data as { groups: MyDataGroup[]; fields: MyDataField[] };
}
export async function createMyDataField(groupId: number): Promise<MyDataField> {
  return ((await apiClient.post('/amazon/my-data/custom', { group_id: groupId })).data as { field: MyDataField }).field;
}
export async function createMyDataGroup(): Promise<MyDataGroup> {
  return ((await apiClient.post('/amazon/my-data/groups', {})).data as { group: MyDataGroup }).group;
}
export async function updateMyDataGroup(id: number, title: string): Promise<MyDataGroup> {
  return ((await apiClient.patch(`/amazon/my-data/groups/${id}`, { title })).data as { group: MyDataGroup }).group;
}
export async function deleteMyDataGroup(id: number): Promise<void> {
  await apiClient.delete(`/amazon/my-data/groups/${id}`);
}
export async function updateMyDataField(id: number, patch: Partial<Pick<MyDataField, 'label' | 'value'>>): Promise<MyDataField> {
  return ((await apiClient.patch(`/amazon/my-data/custom/${id}`, patch)).data as { field: MyDataField }).field;
}
export async function deleteMyDataField(id: number): Promise<void> {
  await apiClient.delete(`/amazon/my-data/custom/${id}`);
}

// ── Sample-Pruefbericht ──────────────────────────────────────────────────────
export type InspectionStatus = 'erfuellt' | 'teilweise' | 'nicht' | 'offen';

export interface InspectionPoint {
  id: number;
  title: string;
  body: string | null;
  questions: string[];
  soll_status: string | null;
  ist_status: InspectionStatus;
  ist_note: string | null;
}
export interface SampleInspection {
  product_name: string;
  manufacturer_name: string;
  marke: string | null;
  inspection_notes: string | null;
  points: InspectionPoint[];
}

const inspectionBase = (pid: number, mid: number, sid: number) =>
  `/amazon/products/${pid}/manufacturers/${mid}/samples/${sid}/inspection`;

export async function fetchSampleInspection(pid: number, mid: number, sid: number): Promise<SampleInspection> {
  return (await apiClient.get(inspectionBase(pid, mid, sid))).data as SampleInspection;
}
export async function saveInspectionResult(
  pid: number, mid: number, sid: number, pointId: number, status: InspectionStatus, note: string | null,
): Promise<void> {
  await apiClient.put(`${inspectionBase(pid, mid, sid)}/${pointId}`, { status, note });
}
export async function saveInspectionNotes(pid: number, mid: number, sid: number, inspection_notes: string | null): Promise<void> {
  await apiClient.patch(inspectionBase(pid, mid, sid), { inspection_notes });
}

// ── Amazon-Modul-Dashboard ────────────────────────────────────────────────────
export interface AmazonDashboardActiveProduct {
  id: number;
  name: string;
  has_image: boolean;
  checklist: { done: number; total: number };
  sourcing: { done: number; total: number };
}
export interface AmazonDashboard {
  counts: { interessant: number; warteliste: number; aktiv: number; bestehend: number; verworfen: number };
  active: AmazonDashboardActiveProduct[];
}
export async function getAmazonDashboard(): Promise<AmazonDashboard> {
  const r = await apiClient.get<AmazonDashboard>('/amazon/dashboard');
  return r.data;
}

export interface AmazonAppointment {
  id: number;
  title: string;
  start_at: string;
  end_at: string | null;
  is_all_day: number;
  location: string | null;
  calendar_name: string;
}
export async function getAmazonAppointments(): Promise<AmazonAppointment[]> {
  const r = await apiClient.get<AmazonAppointment[]>('/amazon/appointments');
  return r.data;
}

// ── Listing (Amazon-Listing-Anatomie + Listing-/Wettbewerber-Bilder) ──────────
export type ListingImageKind = 'listing' | 'competitor';
export interface ListingImage {
  id: number; product_id: number; kind: ListingImageKind; sort_order: number;
  file_path: string; original_name: string | null; mime: string | null; label: string | null;
  // Karten-Felder (Amazon-Suchoptik, Migr. 104 + card_sold Migr. 105).
  card_title: string | null; card_price: string | null; card_rating: number | null; card_reviews: number | null;
  card_sold: string | null;
}
export interface ListingFields {
  product_id: number;
  title: string;
  bullet_1: string; bullet_2: string; bullet_3: string; bullet_4: string; bullet_5: string;
  description: string;
  keywords_main: string;
  keywords_backend: string;
  // Eigene Karten-Angaben (Amazon-Suchoptik, Migr. 104 + comp_own_sold Migr. 105).
  comp_own_title: string | null; comp_own_price: string | null;
  comp_own_rating: number | null; comp_own_reviews: number | null;
  comp_own_sold: string | null;
  comp_search_term: string | null; // editierbarer Amazon-Suchbegriff (Migr. 106)
  comp_own_image: string | null; // Tausch-Bild der eigenen Karte (Dateiname; null = Produkt-Hauptbild, Migr. 109)
}
export interface ListingData {
  listing: ListingFields;
  images: { listing: ListingImage[]; competitor: ListingImage[] };
}
export type ListingPatch = Partial<Omit<ListingFields, 'product_id'>>;

export async function fetchListing(productId: number): Promise<ListingData> {
  const r = await apiClient.get<ListingData>(`/amazon/products/${productId}/listing`);
  return r.data;
}
export async function updateListing(productId: number, patch: ListingPatch): Promise<ListingFields> {
  const r = await apiClient.put<{ listing: ListingFields }>(`/amazon/products/${productId}/listing`, patch);
  return r.data.listing;
}
export async function uploadListingImage(productId: number, kind: ListingImageKind, file: File): Promise<ListingImage> {
  const fd = new FormData(); fd.append('file', file);
  const r = await apiClient.post<{ image: ListingImage }>(
    `/amazon/products/${productId}/listing/images?kind=${kind}`, fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return r.data.image;
}
export async function deleteListingImage(productId: number, imageId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/listing/images/${imageId}`);
}
export async function getListingImageObjectUrl(productId: number, imageId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/listing/images/${imageId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}

// ── Tausch-Bild der eigenen Karte (Migr. 109) ─────────────────────────────────
// Separates Titelbild fuer die eigene Karte im Hauptbild-Vergleicher — ueberschreibt
// NICHT das echte Produkt-Hauptbild. null = Produkt-Hauptbild verwenden.
export async function uploadListingOwnImage(productId: number, file: File): Promise<{ comp_own_image: string }> {
  const fd = new FormData(); fd.append('file', file);
  const r = await apiClient.post<{ comp_own_image: string }>(
    `/amazon/products/${productId}/listing/own-image`, fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return r.data;
}
export async function deleteListingOwnImage(productId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/listing/own-image`);
}
export async function getListingOwnImageObjectUrl(productId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/listing/own-image`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function reorderListingImages(productId: number, kind: ListingImageKind, order: number[]): Promise<void> {
  await apiClient.post(`/amazon/products/${productId}/listing/images/reorder`, { kind, order });
}
// Generisches Karten-Patch: label + card_title/card_price/card_rating/card_reviews/card_sold (jeweils optional).
export type ListingImagePatch = Partial<Pick<ListingImage, 'label' | 'card_title' | 'card_price' | 'card_rating' | 'card_reviews' | 'card_sold'>>;
export async function updateListingImage(productId: number, imageId: number, patch: ListingImagePatch): Promise<ListingImage> {
  const r = await apiClient.patch<{ image: ListingImage }>(`/amazon/products/${productId}/listing/images/${imageId}`, patch);
  return r.data.image;
}

// ── Produkt-Dokumente — „Design & Druck" mit Unterpunkten (Topics) — Migr. 112 ──
// Datei-/Bild-Upload (beliebige Typen) + Notizfeld je Produkt und Unterpunkt (topicId).
// Die DB-Spalte `area` bleibt als Legacy erhalten, ist aber NICHT mehr im Typ — gefiltert
// wird ausschliesslich ueber topic_id.
export interface ProductDocFile {
  id: number; product_id: number; topic_id: number; sort_order: number;
  file_path: string; original_name: string | null; mime: string | null;
  is_final: number; // 0 = Arbeitsdatei, 1 = Finale Datei
  manufacturer_id: number | null; // NULL = Allgemein; sonst Hersteller-ID (nur bei is_final=1 relevant)
  sent_to: number[]; // Hersteller-IDs, an die diese Datei schon gesendet wurde
}
// Text-Varianten je Topic (Beileger-Formulierungs-Kandidaten etc.) — Migr. 119.
// Topic-weit, unabhaengig vom Hersteller-Bucket.
export interface ProductDocTextVariant {
  id: number; topic_id: number; text: string; is_favorite: number;
  sort_order: number; created_at: number; updated_at: number;
}

export interface ProductDocsData {
  files: ProductDocFile[];
  // Notizen als Bucket-Map: Key = manufacturer_bucket als String ("0" = Allgemein).
  notes: Record<string, string>;
  textVariants: ProductDocTextVariant[];
}

// ── Unterpunkte (Topics) von „Design & Druck" ──
export interface ProductDocTopic {
  id: number; product_id: number; name: string; sort_order: number; created_at: number;
}
export async function fetchProductDocTopics(productId: number): Promise<ProductDocTopic[]> {
  const r = await apiClient.get<{ topics: ProductDocTopic[] }>(`/amazon/products/${productId}/topics`);
  return r.data.topics;
}
export async function createProductDocTopic(productId: number, name?: string): Promise<ProductDocTopic> {
  const r = await apiClient.post<{ topic: ProductDocTopic }>(`/amazon/products/${productId}/topics`, name !== undefined ? { name } : {});
  return r.data.topic;
}
export async function renameProductDocTopic(productId: number, topicId: number, name: string): Promise<ProductDocTopic> {
  const r = await apiClient.patch<{ topic: ProductDocTopic }>(`/amazon/products/${productId}/topics/${topicId}`, { name });
  return r.data.topic;
}
export async function reorderProductDocTopics(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/topics/reorder`, { order });
}
export async function deleteProductDocTopic(productId: number, topicId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/topics/${topicId}`);
}

export async function fetchProductDocs(productId: number, topicId: number): Promise<ProductDocsData> {
  const r = await apiClient.get<ProductDocsData>(`/amazon/products/${productId}/docs/${topicId}`);
  return r.data;
}
export async function uploadProductDoc(
  productId: number, topicId: number, file: File, isFinal: 0 | 1 = 0,
  manufacturerId: number | null = null,
): Promise<ProductDocFile> {
  const fd = new FormData(); fd.append('file', file);
  // manufacturer_id nur bei Final-Upload sinnvoll; Backend ignoriert es bei is_final=0.
  const mfrParam = isFinal === 1 && manufacturerId ? `&manufacturer_id=${manufacturerId}` : '';
  const r = await apiClient.post<{ file: ProductDocFile }>(
    `/amazon/products/${productId}/docs/${topicId}?is_final=${isFinal}${mfrParam}`, fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return r.data.file;
}
// Verschiebt eine Datei zwischen Arbeit/Final und setzt beim Verschieben nach Final
// den Ziel-Bucket (manufacturer_id = Hersteller-ID oder null fuer Allgemein).
export async function moveProductDoc(
  productId: number, topicId: number, fileId: number,
  patch: { is_final: 0 | 1; manufacturer_id?: number | null },
): Promise<ProductDocFile> {
  const body: { is_final: 0 | 1; manufacturer_id?: number | null } = { is_final: patch.is_final };
  if (patch.is_final === 1) body.manufacturer_id = patch.manufacturer_id ?? null;
  const r = await apiClient.patch<{ file: ProductDocFile }>(
    `/amazon/products/${productId}/docs/${topicId}/files/${fileId}`, body,
  );
  return r.data.file;
}
// Benennt eine Datei um (nur Anzeige-/Download-Name; die physische Datei bleibt).
export async function renameProductDoc(
  productId: number, topicId: number, fileId: number, name: string,
): Promise<ProductDocFile> {
  const r = await apiClient.patch<{ file: ProductDocFile }>(
    `/amazon/products/${productId}/docs/${topicId}/files/${fileId}`, { original_name: name },
  );
  return r.data.file;
}
// Setzt/entfernt den „gesendet an"-Marker fuer eine Datei × Hersteller.
export async function setProductDocSent(
  productId: number, topicId: number, fileId: number, manufacturerId: number, sent: boolean,
): Promise<void> {
  const url = `/amazon/products/${productId}/docs/${topicId}/files/${fileId}/sends/${manufacturerId}`;
  if (sent) await apiClient.put(url);
  else await apiClient.delete(url);
}
// Verschiebt eine Datei in einen ANDEREN Unterpunkt (Topic) desselben Produkts.
// Es wird die Quell-Topic-Route getroffen; das Ziel-Topic kommt im Body (topic_id).
// Kein Kopieren — die Datei ist danach nur noch im Ziel-Topic.
export async function moveProductDocToTopic(
  productId: number, sourceTopicId: number, fileId: number,
  patch: { topic_id: number; is_final?: 0 | 1; manufacturer_id?: number | null },
): Promise<ProductDocFile> {
  const body: { topic_id: number; is_final: 0 | 1; manufacturer_id?: number | null } = {
    topic_id: patch.topic_id,
    is_final: patch.is_final ?? 0,
  };
  if (body.is_final === 1) body.manufacturer_id = patch.manufacturer_id ?? null;
  const r = await apiClient.patch<{ file: ProductDocFile }>(
    `/amazon/products/${productId}/docs/${sourceTopicId}/files/${fileId}`, body,
  );
  return r.data.file;
}
// Laedt die finalen Dateien eines Buckets als ZIP (bucket=0 → Allgemein, sonst Hersteller-ID)
// und loest den Browser-Download mit den echten Originalnamen im ZIP aus.
export async function downloadProductDocsFinalZip(
  productId: number, topicId: number, bucket: number, filename: string,
): Promise<void> {
  const r = await apiClient.get(`/amazon/products/${productId}/docs/${topicId}/final.zip?bucket=${bucket}`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function deleteProductDoc(productId: number, topicId: number, fileId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/docs/${topicId}/files/${fileId}`);
}
export async function getProductDocObjectUrl(productId: number, topicId: number, fileId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/docs/${topicId}/files/${fileId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function reorderProductDocs(productId: number, topicId: number, order: number[]): Promise<void> {
  await apiClient.post(`/amazon/products/${productId}/docs/${topicId}/reorder`, { order });
}
export async function updateProductDocNotes(
  productId: number, topicId: number, bucket: number, notes: string,
): Promise<string> {
  const r = await apiClient.put<{ manufacturer_bucket: number; notes: string }>(
    `/amazon/products/${productId}/docs/${topicId}/notes`, { manufacturer_bucket: bucket, notes },
  );
  return r.data.notes;
}

// ── Text-Varianten je Topic (Migr. 119) ───────────────────────────────────────
export async function createProductDocTextVariant(productId: number, topicId: number): Promise<ProductDocTextVariant> {
  const r = await apiClient.post<{ variant: ProductDocTextVariant }>(
    `/amazon/products/${productId}/docs/${topicId}/text-variants`, {},
  );
  return r.data.variant;
}
export async function updateProductDocTextVariant(
  productId: number, topicId: number, variantId: number, patch: { text?: string; is_favorite?: 0 | 1 },
): Promise<ProductDocTextVariant> {
  const r = await apiClient.patch<{ variant: ProductDocTextVariant }>(
    `/amazon/products/${productId}/docs/${topicId}/text-variants/${variantId}`, patch,
  );
  return r.data.variant;
}
export async function deleteProductDocTextVariant(productId: number, topicId: number, variantId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/docs/${topicId}/text-variants/${variantId}`);
}

// ════════════════════════════════════════════════════════════════════════════
// Verpackung & Versand ("packaging") — Singlebox/Masterbox-Checklisten, GPSR, Briefing-PDF.
// ════════════════════════════════════════════════════════════════════════════

export interface PackagingCheckItem {
  id: number;
  product_id: number | null;
  box_type: 'single' | 'master';
  category: string;
  name: string;
  description: string | null;
  requirement: string | null;
  severity: 'pflicht' | 'empfohlen' | 'optional';
  sort_order: number;
  status: 'erledigt' | 'nicht_zutreffend' | null;
  is_custom: boolean;
}
export interface GpsrResponsible { name: string; address: string; email: string; phone: string; }
export interface PackagingRow {
  product_id: number;
  single_w: number | null; single_h: number | null; single_d: number | null;
  single_weight_kg: number | null;
  master_w: number | null; master_h: number | null; master_d: number | null;
  units_per_master: number | null;
  master_tare_kg: number | null;
  order_qty: number | null;
  single_final: number; master_final: number;
  mfr_name: string | null; mfr_address: string | null; mfr_contact: string | null;
  notes: string;
  created_at: number; updated_at: number;
}
export interface PackagingData {
  packaging: PackagingRow;
  items: PackagingCheckItem[];
  gpsr: {
    responsible: GpsrResponsible;
    manufacturer: { name: string | null; address: string | null; contact: string | null };
  };
}
export type PackagingPatch = Partial<Pick<PackagingRow,
  'single_w' | 'single_h' | 'single_d' | 'single_weight_kg' |
  'master_w' | 'master_h' | 'master_d' | 'units_per_master' | 'master_tare_kg' | 'order_qty' |
  'mfr_name' | 'mfr_address' | 'mfr_contact' | 'notes'
>>;
export interface PackagingItemCreate {
  box_type: 'single' | 'master';
  category: string;
  name: string;
  description?: string;
  requirement?: string;
  severity: 'pflicht' | 'empfohlen' | 'optional';
}

export async function fetchPackaging(productId: number): Promise<PackagingData> {
  const r = await apiClient.get<PackagingData>(`/amazon/products/${productId}/packaging`);
  return r.data;
}
export async function savePackaging(productId: number, patch: PackagingPatch): Promise<PackagingRow> {
  const r = await apiClient.put<PackagingRow>(`/amazon/products/${productId}/packaging`, patch);
  return r.data;
}
export async function setPackagingFinal(productId: number, box: 'single' | 'master', final: 0 | 1): Promise<{ box: string; final: number }> {
  const r = await apiClient.patch<{ box: string; final: number }>(`/amazon/products/${productId}/packaging/final`, { box, final });
  return r.data;
}
export async function setPackagingCheck(
  productId: number, itemId: number, status: 'erledigt' | 'nicht_zutreffend' | null,
): Promise<{ item_id: number; status: string | null }> {
  const r = await apiClient.put<{ item_id: number; status: string | null }>(
    `/amazon/products/${productId}/packaging/checks/${itemId}`, { status },
  );
  return r.data;
}
export async function createPackagingItem(productId: number, body: PackagingItemCreate): Promise<PackagingCheckItem> {
  const r = await apiClient.post<PackagingCheckItem>(`/amazon/products/${productId}/packaging/items`, body);
  return r.data;
}
export async function deletePackagingItem(productId: number, itemId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/packaging/items/${itemId}`);
}
export async function fetchGpsr(): Promise<GpsrResponsible> {
  const r = await apiClient.get<GpsrResponsible>('/amazon/gpsr');
  return r.data;
}
export async function saveGpsr(patch: Partial<GpsrResponsible>): Promise<GpsrResponsible> {
  const r = await apiClient.put<GpsrResponsible>('/amazon/gpsr', patch);
  return r.data;
}
export async function downloadPackagingBriefing(productId: number, filename: string): Promise<void> {
  const r = await apiClient.get(`/amazon/products/${productId}/packaging/briefing.pdf`, { responseType: 'blob' });
  const objUrl = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
}
