import { apiFetch } from './auth';

export interface ArticleAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ArticleRecord {
  id: string;
  title: string;
  slug: string;
  category: string;
  content: string;
  tags: string[];
  status: string;
  currentVersionId: string | null;
  authorId: string | null;
  author: ArticleAuthor | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleVersionRecord {
  id: string;
  articleId: string;
  versionNumber: number;
  title: string;
  content: string;
  changeSummary: string | null;
  createdBy: string | null;
  creator: ArticleAuthor | null;
  createdAt: string;
}

export interface PaginatedArticles {
  data: ArticleRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ── Articles ───────────────────────────────────────────────────────────────

export async function fetchArticles(
  params: Record<string, string> = {},
): Promise<PaginatedArticles> {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/articles?${query}`);
  if (!res.ok) throw new Error('Failed to fetch articles');
  return res.json();
}

export async function fetchArticle(id: string): Promise<ArticleRecord> {
  const res = await apiFetch(`/articles/${id}`);
  if (!res.ok) throw new Error('Failed to fetch article');
  return res.json();
}

export async function fetchArticleBySlug(slug: string): Promise<ArticleRecord> {
  const res = await apiFetch(`/articles/slug/${slug}`);
  if (!res.ok) throw new Error('Failed to fetch article');
  return res.json();
}

export async function createArticle(payload: {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  changeSummary?: string;
}): Promise<ArticleRecord> {
  const res = await apiFetch('/articles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create article');
  }
  return res.json();
}

export async function updateArticle(
  id: string,
  payload: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    changeSummary?: string;
  },
): Promise<ArticleRecord> {
  const res = await apiFetch(`/articles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to update article');
  }
  return res.json();
}

export async function promoteArticle(
  id: string,
  status: string,
): Promise<ArticleRecord> {
  const res = await apiFetch(`/articles/${id}/promote`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to promote article');
  }
  return res.json();
}

// ── Versions ───────────────────────────────────────────────────────────────

export async function fetchArticleVersions(
  articleId: string,
): Promise<ArticleVersionRecord[]> {
  const res = await apiFetch(`/articles/${articleId}/versions`);
  if (!res.ok) throw new Error('Failed to fetch versions');
  return res.json();
}

export async function fetchArticleVersion(
  articleId: string,
  versionNumber: number,
): Promise<ArticleVersionRecord> {
  const res = await apiFetch(`/articles/${articleId}/versions/${versionNumber}`);
  if (!res.ok) throw new Error('Failed to fetch version');
  return res.json();
}

// ── Favorites ──────────────────────────────────────────────────────────────

export async function addFavorite(articleId: string): Promise<void> {
  await apiFetch(`/articles/${articleId}/favorite`, { method: 'POST' });
}

export async function removeFavorite(articleId: string): Promise<void> {
  await apiFetch(`/articles/${articleId}/favorite`, { method: 'DELETE' });
}

export async function isFavorited(articleId: string): Promise<boolean> {
  const res = await apiFetch(`/articles/${articleId}/favorite`);
  if (!res.ok) return false;
  return res.json();
}

export async function fetchFavorites(): Promise<ArticleRecord[]> {
  const res = await apiFetch('/users/me/favorites');
  if (!res.ok) throw new Error('Failed to fetch favorites');
  return res.json();
}
