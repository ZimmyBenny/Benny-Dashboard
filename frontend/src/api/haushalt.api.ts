import apiClient from './client';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HaushaltEintrag {
  id: number;
  datum: string;
  betrag: number;
  beschreibung: string;
  kategorie: 'Einkäufe' | 'Kind' | 'Haushalt' | 'Freizeit' | 'Urlaub' | 'Nebenkosten' | 'Miete' | 'Sonstiges';
  bezahlt_von: 'benny' | 'julia';
  eintrag_typ: 'ausgabe' | 'geldübergabe';
  aufteilung_prozent: number;
  zahlungsart: 'cash' | 'überweisung' | 'offen' | null;
  zeitraum_von: string | null;
  zeitraum_bis: string | null;
  abrechnung_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface HaushaltSaldo {
  saldo: number;
  julia_schuldet: number;
  benny_schuldet: number;
  offene_eintraege: number;
}

export interface HaushaltAbrechnung {
  id: number;
  titel: string;
  datum: string;
  ausgleich_betrag: number;
  notiz: string | null;
  created_at: string;
  eintraege_count: number;
}

// ---------------------------------------------------------------------------
// API-Funktionen — Eintraege
// ---------------------------------------------------------------------------

export async function fetchEintraege(abrechnungId?: number | null): Promise<HaushaltEintrag[]> {
  const params: Record<string, string> = {};
  if (abrechnungId !== undefined && abrechnungId !== null) {
    params.abrechnung_id = String(abrechnungId);
  }
  return apiClient.get<HaushaltEintrag[]>('/haushalt', { params }).then(r => r.data);
}

export async function createEintrag(data: Partial<HaushaltEintrag>): Promise<HaushaltEintrag> {
  return apiClient.post<HaushaltEintrag>('/haushalt', data).then(r => r.data);
}

export async function updateEintrag(id: number, data: Partial<HaushaltEintrag>): Promise<HaushaltEintrag> {
  return apiClient.put<HaushaltEintrag>(`/haushalt/${id}`, data).then(r => r.data);
}

export async function deleteEintrag(id: number): Promise<void> {
  await apiClient.delete(`/haushalt/${id}`);
}

// ---------------------------------------------------------------------------
// API-Funktionen — Saldo
// ---------------------------------------------------------------------------

export async function fetchSaldo(): Promise<HaushaltSaldo> {
  return apiClient.get<HaushaltSaldo>('/haushalt/saldo').then(r => r.data);
}

// ---------------------------------------------------------------------------
// API-Funktionen — Abrechnungen
// ---------------------------------------------------------------------------

export async function fetchAbrechnungen(): Promise<HaushaltAbrechnung[]> {
  return apiClient.get<HaushaltAbrechnung[]>('/haushalt/abrechnungen').then(r => r.data);
}

export async function fetchAbrechnungEintraege(id: number): Promise<HaushaltEintrag[]> {
  return apiClient.get<HaushaltEintrag[]>(`/haushalt/abrechnungen/${id}/eintraege`).then(r => r.data);
}

export async function createAbrechnung(data: { titel: string; notiz?: string }): Promise<HaushaltAbrechnung> {
  return apiClient.post<HaushaltAbrechnung>('/haushalt/abrechnungen', data).then(r => r.data);
}
