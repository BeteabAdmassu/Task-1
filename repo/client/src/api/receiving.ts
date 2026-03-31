import { apiFetch } from './auth';

export interface PutawayLocationRecord {
  id: string;
  code: string;
  description: string | null;
  zone: string | null;
  isActive: boolean;
}

export interface ReceiptLineItemRecord {
  id: string;
  poLineItemId: string;
  poLineItem: { id: string; description: string; unitPrice: number } | null;
  quantityExpected: number;
  quantityReceived: number;
  varianceQuantity: number;
  varianceReasonCode: string;
  varianceNotes: string | null;
  putawayLocationId: string | null;
  putawayLocation: PutawayLocationRecord | null;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  poId: string;
  purchaseOrder: { id: string; poNumber: string } | null;
  receivedBy: string;
  receiver: { id: string; firstName: string; lastName: string } | null;
  receivedAt: string | null;
  status: string;
  notes: string | null;
  lineItems: ReceiptLineItemRecord[];
  createdAt: string;
}

export interface PaginatedReceipts {
  data: ReceiptRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type ReceivingEntryMode = 'BARCODE' | 'MANUAL';

export interface CreateReceiptLineItemPayload {
  poLineItemId: string;
  quantityExpected: number;
  quantityReceived: number;
  varianceReasonCode?: string;
  varianceNotes?: string;
  putawayLocationId?: string;
}

export async function fetchPutawayLocations(): Promise<PutawayLocationRecord[]> {
  const res = await apiFetch('/putaway-locations?activeOnly=true');
  if (!res.ok) throw new Error('Failed to fetch putaway locations');
  return res.json();
}

export async function fetchAdminPutawayLocations(): Promise<PutawayLocationRecord[]> {
  const res = await apiFetch('/admin/putaway-locations');
  if (!res.ok) throw new Error('Failed to fetch putaway locations');
  return res.json();
}

export async function createPutawayLocation(payload: {
  code: string;
  description?: string;
  zone?: string;
  isActive?: boolean;
}): Promise<PutawayLocationRecord> {
  const res = await apiFetch('/admin/putaway-locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create location');
  }
  return res.json();
}

export async function updatePutawayLocation(
  id: string,
  payload: { code: string; description?: string; zone?: string; isActive?: boolean },
): Promise<PutawayLocationRecord> {
  const res = await apiFetch(`/admin/putaway-locations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update location');
  }
  return res.json();
}

export async function deletePutawayLocation(id: string): Promise<void> {
  const res = await apiFetch(`/admin/putaway-locations/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to delete location');
  }
}

export async function fetchReceipts(
  params: Record<string, string> = {},
): Promise<PaginatedReceipts> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/receipts?${query}`);
  if (!res.ok) throw new Error('Failed to fetch receipts');
  return res.json();
}

export async function createReceipt(payload: {
  poId: string;
  entryMode?: ReceivingEntryMode;
  notes?: string;
  lineItems: CreateReceiptLineItemPayload[];
}): Promise<ReceiptRecord> {
  const res = await apiFetch('/receipts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create receipt');
  }
  return res.json();
}

export async function completeReceipt(id: string): Promise<ReceiptRecord> {
  const res = await apiFetch(`/receipts/${id}/complete`, { method: 'PATCH' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to complete receipt');
  }
  return res.json();
}
