import { apiFetch } from './auth';

export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  tags: string[];
  author: { id: string; firstName: string; lastName: string } | null;
  headline: string;
  rank: number;
  updatedAt: string;
}

export interface SearchResponse {
  data: SearchResult[];
  total: number;
  expandedTerms: string[];
}

export interface SearchHistoryRecord {
  id: string;
  userId: string;
  query: string;
  resultCount: number;
  searchedAt: string;
}

export interface SimilarArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  tags: string[];
  score: number;
}

export interface SynonymRecord {
  id: string;
  term: string;
  synonyms: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchArticles(params: {
  q: string;
  category?: string;
  tags?: string;
}): Promise<SearchResponse> {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>,
  ).toString();
  const res = await apiFetch(`/articles/search?${query}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function fetchSimilarArticles(articleId: string): Promise<SimilarArticle[]> {
  const res = await apiFetch(`/articles/${articleId}/similar`);
  if (!res.ok) return [];
  return res.json();
}

// ── History ────────────────────────────────────────────────────────────────

export async function fetchSearchHistory(q?: string): Promise<SearchHistoryRecord[]> {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await apiFetch(`/users/me/search-history${query}`);
  if (!res.ok) return [];
  return res.json();
}

// ── Admin synonyms ─────────────────────────────────────────────────────────

export async function fetchSynonyms(): Promise<SynonymRecord[]> {
  const res = await apiFetch('/admin/synonyms');
  if (!res.ok) throw new Error('Failed to fetch synonyms');
  return res.json();
}

export async function createSynonym(payload: {
  term: string;
  synonyms: string[];
}): Promise<SynonymRecord> {
  const res = await apiFetch('/admin/synonyms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create synonym');
  }
  return res.json();
}

export async function updateSynonym(
  id: string,
  payload: { term?: string; synonyms?: string[] },
): Promise<SynonymRecord> {
  const res = await apiFetch(`/admin/synonyms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update synonym');
  }
  return res.json();
}

export async function deleteSynonym(id: string): Promise<void> {
  await apiFetch(`/admin/synonyms/${id}`, { method: 'DELETE' });
}
