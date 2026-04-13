import apiClient from './client';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Contract {
  id: number;
  title: string;
  item_type: string; // Vertrag|Dokument|Frist|Versicherung|Mitgliedschaft|Garantie|Sonstiges
  area: string;
  status: string; // aktiv|in_pruefung|gekuendigt|abgelaufen|archiviert
  priority: string; // niedrig|mittel|hoch|kritisch
  provider_name: string | null;
  reference_number: string | null;
  start_date: string | null;
  expiration_date: string | null;
  cancellation_date: string | null;
  reminder_date: string | null;

  cost_amount: number | null;
  currency: string;
  cost_interval: string | null;
  description: string | null;
  notes: string | null;
  tags: string | null;
  linked_contact_id: number | null;
  linked_task_id: number | null;
  linked_calendar_event_id: string | null;
  is_archived: number;
  unbefristet: number;          // 0 | 1
  vertragsinhaber: string | null;
  kontoname: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractActivity {
  id: number;
  item_id: number;
  event_type: string;
  message: string;
  created_at: string;
}

export interface ContractDetail extends Contract {
  activity_log: ContractActivity[];
}

export interface ContractListResponse {
  data: Contract[];
  total: number;
}

// ---------------------------------------------------------------------------
// API-Funktionen
// ---------------------------------------------------------------------------

export async function fetchContracts(params?: Record<string, string | number>): Promise<ContractListResponse> {
  return apiClient.get<ContractListResponse>('/contracts', { params }).then(r => r.data);
}

export async function fetchContract(id: number): Promise<ContractDetail> {
  return apiClient.get<ContractDetail>(`/contracts/${id}`).then(r => r.data);
}

export async function createContract(data: Partial<Contract>): Promise<ContractDetail> {
  return apiClient.post<ContractDetail>('/contracts', data).then(r => r.data);
}

export async function updateContract(id: number, data: Partial<Contract>): Promise<ContractDetail> {
  return apiClient.put<ContractDetail>(`/contracts/${id}`, data).then(r => r.data);
}

export async function archiveContract(id: number): Promise<ContractDetail> {
  return apiClient.post<ContractDetail>(`/contracts/${id}/archive`).then(r => r.data);
}

export async function deleteContract(id: number): Promise<void> {
  await apiClient.delete(`/contracts/${id}`);
}

// ---------------------------------------------------------------------------
// Anhänge
// ---------------------------------------------------------------------------

export interface ContractAttachment {
  id: number;
  item_id: number;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  uploaded_at: string;
}

export async function fetchContractAttachments(contractId: number): Promise<ContractAttachment[]> {
  return apiClient.get<ContractAttachment[]>(`/contracts/${contractId}/attachments`).then(r => r.data);
}

export async function uploadContractAttachment(contractId: number, file: File): Promise<ContractAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<ContractAttachment>(`/contracts/${contractId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteContractAttachment(contractId: number, attachmentId: number): Promise<void> {
  await apiClient.delete(`/contracts/${contractId}/attachments/${attachmentId}`);
}

const BROWSER_DISPLAYABLE = ['application/pdf', 'image/', 'text/plain', 'text/html', 'video/', 'audio/'];

export async function openContractAttachment(contractId: number, attachmentId: number, fileName: string): Promise<void> {
  const { data } = await apiClient.get(`/contracts/${contractId}/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  });
  const canDisplay = BROWSER_DISPLAYABLE.some(t => (data as Blob).type.startsWith(t));
  const url = URL.createObjectURL(data);
  if (canDisplay) {
    const win = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    if (!win) {
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } else {
    // Nicht im Browser anzeigbar (z.B. .docx) → Download → macOS öffnet mit Standardapp
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export async function downloadContractAttachment(contractId: number, attachmentId: number, fileName: string): Promise<void> {
  const { data } = await apiClient.get(`/contracts/${contractId}/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function revealContractAttachment(contractId: number, attachmentId: number): Promise<void> {
  await apiClient.get(`/contracts/${contractId}/attachments/${attachmentId}/reveal`);
}
