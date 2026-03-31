import { apiFetch } from './auth';

export interface UserRecord {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUsers {
  data: UserRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateUserPayload {
  username: string;
  password: string;
  role: string;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  role?: string;
  isActive?: boolean;
}

export async function fetchUsers(params: Record<string, string> = {}): Promise<PaginatedUsers> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/admin/users?${query}`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function createUser(payload: CreateUserPayload): Promise<UserRecord> {
  const res = await apiFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create user');
  }
  return res.json();
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<UserRecord> {
  const res = await apiFetch(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update user');
  }
  return res.json();
}

export async function resetUserPassword(id: string): Promise<{ temporaryPassword: string }> {
  const res = await apiFetch(`/admin/users/${id}/reset-password`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reset password');
  return res.json();
}
