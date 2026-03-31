const BASE = '/api';

export interface SystemLog {
  id: string;
  requestId: string | null;
  userId: string | null;
  level: string;
  service: string | null;
  message: string;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface JobRun {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  attempt: number;
  errorMessage: string | null;
}

export interface JobMetric {
  jobName: string;
  schedule: string;
  lastRun: JobRun | null;
  successCount: number;
  failureCount: number;
}

export interface QueueStats {
  pendingNotifications: number;
  pendingDuplicateCandidates: number;
}

export interface SystemStats {
  queues: QueueStats;
  dbConnections: { active: number; idle: number; total: number };
  tableSizes: Array<{ table: string; sizeBytes: number; prettySize: string }>;
  uptimeSeconds: number;
}

export interface LogsResponse {
  data: SystemLog[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchLogs(params: {
  level?: string;
  service?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<LogsResponse> {
  const qs = new URLSearchParams();
  if (params.level) qs.set('level', params.level);
  if (params.service) qs.set('service', params.service);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  return apiFetch<LogsResponse>(`/admin/logs?${qs}`);
}

export function fetchJobs(): Promise<{ jobs: JobMetric[] }> {
  return apiFetch<{ jobs: JobMetric[] }>('/admin/jobs');
}

export function retryJob(runId: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/jobs/${runId}/retry`, { method: 'POST' });
}

export function fetchSystemStats(): Promise<SystemStats> {
  return apiFetch<SystemStats>('/admin/system/stats');
}
