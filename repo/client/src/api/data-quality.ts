import { apiFetch } from './auth';

export interface DuplicateCandidate {
  id: string;
  entityType: string;
  sourceId: string;
  targetId: string;
  similarityScore: number;
  isAutoMergeCandidate: boolean;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface DuplicateDetail {
  candidate: DuplicateCandidate;
  source: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
}

export interface DataQualityIssue {
  type: string;
  entityType: string;
  entityId: string;
  label: string;
  detail: string;
}

export interface DataQualityReport {
  checkedAt: string;
  issues: DataQualityIssue[];
  counts: {
    missingEmail: number;
    missingPaymentTerms: number;
    duplicateSuppliers: number;
    outlierPricing: number;
  };
}

export interface DQSummary {
  pendingDuplicates: number;
  issuesFound: number | null;
  lastCheckedAt: string | null;
  counts: DataQualityReport['counts'] | null;
}

// ── Duplicates ─────────────────────────────────────────────────────────────

export async function fetchDuplicates(params: {
  status?: string;
  entityType?: string;
} = {}): Promise<DuplicateCandidate[]> {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>,
  ).toString();
  const res = await apiFetch(`/admin/duplicates?${query}`);
  if (!res.ok) throw new Error('Failed to fetch duplicates');
  return res.json();
}

export async function fetchDuplicateDetail(id: string): Promise<DuplicateDetail> {
  const res = await apiFetch(`/admin/duplicates/${id}`);
  if (!res.ok) throw new Error('Failed to fetch duplicate detail');
  return res.json();
}

export async function mergeDuplicate(id: string): Promise<void> {
  const res = await apiFetch(`/admin/duplicates/${id}/merge`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || 'Merge failed');
  }
}

export async function dismissDuplicate(id: string): Promise<void> {
  const res = await apiFetch(`/admin/duplicates/${id}/dismiss`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || 'Dismiss failed');
  }
}

// ── Quality issues ─────────────────────────────────────────────────────────

export async function fetchQualityIssues(): Promise<DataQualityReport | null> {
  const res = await apiFetch('/admin/data-quality/issues');
  if (!res.ok) throw new Error('Failed to fetch issues');
  return res.json();
}

export async function runQualityCheck(): Promise<DataQualityReport> {
  const res = await apiFetch('/admin/data-quality/run-check', { method: 'POST' });
  if (!res.ok) throw new Error('Quality check failed');
  return res.json();
}

export async function fetchDQSummary(): Promise<DQSummary> {
  const res = await apiFetch('/admin/data-quality/summary');
  if (!res.ok) throw new Error('Failed to fetch summary');
  return res.json();
}
