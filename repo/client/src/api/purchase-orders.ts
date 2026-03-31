import { apiFetch } from './auth';

export interface PoLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  quantityReceived: number;
  catalogItemId: string | null;
}

export interface PurchaseOrderRecord {
  id: string;
  poNumber: string;
  requestId: string | null;
  request: { id: string; requestNumber: string } | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  lineItems: PoLineItem[];
  totalAmount: number;
  status: string;
  issuedAt: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedPos {
  data: PurchaseOrderRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function fetchPos(params: Record<string, string> = {}): Promise<PaginatedPos> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/purchase-orders?${query}`);
  if (!res.ok) throw new Error('Failed to fetch purchase orders');
  return res.json();
}

export async function fetchPo(id: string): Promise<PurchaseOrderRecord> {
  const res = await apiFetch(`/purchase-orders/${id}`);
  if (!res.ok) throw new Error('Failed to fetch purchase order');
  return res.json();
}

export async function updatePo(
  id: string,
  payload: { expectedDeliveryDate?: string; notes?: string },
): Promise<PurchaseOrderRecord> {
  const res = await apiFetch(`/purchase-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update PO');
  }
  return res.json();
}

export async function issuePo(id: string): Promise<PurchaseOrderRecord> {
  const res = await apiFetch(`/purchase-orders/${id}/issue`, { method: 'PATCH' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to issue PO');
  }
  return res.json();
}

export async function cancelPo(id: string): Promise<PurchaseOrderRecord> {
  const res = await apiFetch(`/purchase-orders/${id}/cancel`, { method: 'PATCH' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to cancel PO');
  }
  return res.json();
}

// Supplier portal
export async function fetchPortalPos(params: Record<string, string> = {}): Promise<PaginatedPos> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/supplier-portal/purchase-orders?${query}`);
  if (!res.ok) throw new Error('Failed to fetch purchase orders');
  return res.json();
}

export async function fetchPortalPo(id: string): Promise<PurchaseOrderRecord> {
  const res = await apiFetch(`/supplier-portal/purchase-orders/${id}`);
  if (!res.ok) throw new Error('Failed to fetch purchase order');
  return res.json();
}
