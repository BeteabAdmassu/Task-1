import { apiFetch } from './auth';

export interface LineItem {
  id?: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  catalogItemId?: string | null;
}

export interface ApprovalRecord {
  id: string;
  approverId: string;
  approver: { id: string; username: string };
  action: 'APPROVE' | 'REJECT';
  comments: string | null;
  createdAt: string;
}

export interface PurchaseRequestRecord {
  id: string;
  requestNumber: string;
  title: string;
  description: string | null;
  requestedBy: string;
  requester: { id: string; username: string };
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  lineItems: LineItem[];
  totalAmount: number;
  status: string;
  approvalTier: number;
  approvals: ApprovalRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedRequests {
  data: PurchaseRequestRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateRequestPayload {
  title: string;
  description?: string;
  supplierId?: string;
  lineItems: { itemDescription: string; quantity: number; unitPrice: number; catalogItemId?: string }[];
}

export async function fetchRequests(params: Record<string, string> = {}): Promise<PaginatedRequests> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/procurement/requests?${query}`);
  if (!res.ok) throw new Error('Failed to fetch requests');
  return res.json();
}

export async function fetchRequest(id: string): Promise<PurchaseRequestRecord> {
  const res = await apiFetch(`/procurement/requests/${id}`);
  if (!res.ok) throw new Error('Failed to fetch request');
  return res.json();
}

export async function createRequest(payload: CreateRequestPayload): Promise<PurchaseRequestRecord> {
  const res = await apiFetch('/procurement/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create request');
  }
  return res.json();
}

export async function updateRequest(id: string, payload: Partial<CreateRequestPayload>): Promise<PurchaseRequestRecord> {
  const res = await apiFetch(`/procurement/requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update request');
  }
  return res.json();
}

export async function submitRequest(id: string): Promise<PurchaseRequestRecord> {
  const res = await apiFetch(`/procurement/requests/${id}/submit`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to submit request');
  }
  return res.json();
}

export async function processApproval(
  id: string,
  action: 'APPROVE' | 'REJECT',
  comments?: string,
): Promise<PurchaseRequestRecord> {
  const res = await apiFetch(`/procurement/requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ action, comments }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to process approval');
  }
  return res.json();
}

export async function cancelRequest(id: string): Promise<PurchaseRequestRecord> {
  const res = await apiFetch(`/procurement/requests/${id}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to cancel request');
  }
  return res.json();
}

export async function fetchApprovalQueue(params: Record<string, string> = {}): Promise<PaginatedRequests> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/procurement/requests/approval-queue?${query}`);
  if (!res.ok) throw new Error('Failed to fetch approval queue');
  return res.json();
}
