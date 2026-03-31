import { apiFetch } from './auth';

export interface ReturnPolicyRecord {
  id: number;
  returnWindowDays: number;
  restockingFeeDefault: number;
  restockingFeeAfterDaysThreshold: number;
  restockingFeeAfterDays: number;
  updatedAt: string;
}

export interface ReturnLineItemRecord {
  id: string;
  receiptLineItemId: string;
  receiptLineItem: {
    id: string;
    quantityReceived: number;
    poLineItem: { id: string; description: string; unitPrice: number } | null;
  } | null;
  quantityReturned: number;
  reasonCode: string;
  reasonNotes: string | null;
  restockingFeePercent: number;
  restockingFeeAmount: number;
  refundAmount: number;
}

export interface ReturnAuthorizationRecord {
  id: string;
  raNumber: string;
  receiptId: string;
  receipt: { id: string; receiptNumber: string; receivedAt: string | null } | null;
  poId: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  createdBy: string | null;
  creator: { id: string; firstName: string; lastName: string } | null;
  status: string;
  returnWindowDays: number;
  returnDeadline: string;
  lineItems: ReturnLineItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedReturns {
  data: ReturnAuthorizationRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateReturnLineItemPayload {
  receiptLineItemId: string;
  quantityReturned: number;
  reasonCode: string;
  reasonNotes?: string;
}

// ── Returns ────────────────────────────────────────────────────────────────

export async function fetchReturns(
  params: Record<string, string> = {},
): Promise<PaginatedReturns> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/returns?${query}`);
  if (!res.ok) throw new Error('Failed to fetch returns');
  return res.json();
}

export async function fetchReturn(id: string): Promise<ReturnAuthorizationRecord> {
  const res = await apiFetch(`/returns/${id}`);
  if (!res.ok) throw new Error('Failed to fetch return');
  return res.json();
}

export async function createReturn(payload: {
  receiptId: string;
  lineItems: CreateReturnLineItemPayload[];
}): Promise<ReturnAuthorizationRecord> {
  const res = await apiFetch('/returns', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create return');
  }
  return res.json();
}

export async function submitReturn(id: string): Promise<ReturnAuthorizationRecord> {
  const res = await apiFetch(`/returns/${id}/submit`, { method: 'PATCH' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to submit return');
  }
  return res.json();
}

export async function updateReturnStatus(
  id: string,
  status: string,
): Promise<ReturnAuthorizationRecord> {
  const res = await apiFetch(`/returns/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update return status');
  }
  return res.json();
}

// ── Policy ─────────────────────────────────────────────────────────────────

export async function fetchReturnPolicy(): Promise<ReturnPolicyRecord> {
  const res = await apiFetch('/admin/return-policy');
  if (!res.ok) throw new Error('Failed to fetch return policy');
  return res.json();
}

export async function updateReturnPolicy(
  payload: Partial<Omit<ReturnPolicyRecord, 'id' | 'updatedAt'>>,
): Promise<ReturnPolicyRecord> {
  const res = await apiFetch('/admin/return-policy', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update policy');
  }
  return res.json();
}

// ── Supplier portal ────────────────────────────────────────────────────────

export async function fetchPortalReturns(
  params: Record<string, string> = {},
): Promise<PaginatedReturns> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/supplier-portal/returns?${query}`);
  if (!res.ok) throw new Error('Failed to fetch returns');
  return res.json();
}

export async function fetchPortalReturn(id: string): Promise<ReturnAuthorizationRecord> {
  const res = await apiFetch(`/supplier-portal/returns/${id}`);
  if (!res.ok) throw new Error('Failed to fetch return');
  return res.json();
}
