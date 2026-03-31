import { apiFetch } from './auth';

export interface LedgerEntrySummary {
  totalDeposits: number;
  totalPayments: number;
  totalEscrowHolds: number;
  totalRefunds: number;
  currentBalance: number;
}

export interface LedgerEntryRecord {
  id: string;
  supplierId: string;
  type: string;
  amount: number;
  runningBalance: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdBy: string | null;
  creator: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface LedgerResponse {
  data: LedgerEntryRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary: LedgerEntrySummary;
}

export async function fetchLedger(
  supplierId: string,
  params: Record<string, string> = {},
): Promise<LedgerResponse> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/suppliers/${supplierId}/ledger?${query}`);
  if (!res.ok) throw new Error('Failed to fetch ledger');
  return res.json();
}

export async function createDeposit(
  supplierId: string,
  payload: { amount: number; description?: string; referenceType?: string; referenceId?: string },
): Promise<LedgerEntrySummary> {
  const res = await apiFetch(`/suppliers/${supplierId}/ledger/deposit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create deposit');
  }
  return res.json();
}

export async function createAdjustment(
  supplierId: string,
  payload: { amount: number; description: string; referenceType?: string; referenceId?: string },
): Promise<LedgerEntrySummary> {
  const res = await apiFetch(`/suppliers/${supplierId}/ledger/adjustment`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create adjustment');
  }
  return res.json();
}
