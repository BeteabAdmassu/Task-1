import { apiFetch } from './auth';

export interface SupplierRecord {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string;
  customTermsDescription: string | null;
  bankingNotes?: string | null;
  internalRiskFlag?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedSuppliers {
  data: SupplierRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SupplierDropdownItem {
  id: string;
  name: string;
}

export async function fetchSuppliers(
  params: Record<string, string> = {},
): Promise<PaginatedSuppliers> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/suppliers?${query}`);
  if (!res.ok) throw new Error('Failed to fetch suppliers');
  return res.json();
}

export async function fetchSupplier(id: string): Promise<SupplierRecord> {
  const res = await apiFetch(`/suppliers/${id}`);
  if (!res.ok) throw new Error('Failed to fetch supplier');
  return res.json();
}

export async function createSupplier(
  payload: Partial<SupplierRecord>,
): Promise<SupplierRecord> {
  const res = await apiFetch('/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create supplier');
  }
  return res.json();
}

export async function updateSupplier(
  id: string,
  payload: Partial<SupplierRecord>,
): Promise<SupplierRecord> {
  const res = await apiFetch(`/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update supplier');
  }
  return res.json();
}

export async function fetchSupplierDropdown(): Promise<SupplierDropdownItem[]> {
  const res = await apiFetch('/suppliers/dropdown');
  if (!res.ok) throw new Error('Failed to fetch suppliers');
  return res.json();
}

export async function fetchSupplierPortalProfile(): Promise<SupplierRecord> {
  const res = await apiFetch('/supplier-portal/profile');
  if (!res.ok) throw new Error('Failed to fetch supplier profile');
  return res.json();
}
