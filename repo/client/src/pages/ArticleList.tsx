import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchArticles, PaginatedArticles } from '../api/knowledge-base';
import { getCategoryLabel, getStatusLabel, getStatusClass, ARTICLE_CATEGORIES } from '../utils/article';
import { useAuth } from '../contexts/AuthContext';
import { SearchBar } from '../components/SearchBar';

export function ArticleList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMINISTRATOR';

  const [data, setData] = useState<PaginatedArticles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (category) params.category = category;
      setData(await fetchArticles(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, category]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Knowledge Base</h2>
        {isAdmin && (
          <button
            className="btn-primary btn-sm"
            onClick={() => navigate('/plant-care/articles/new')}
          >
            New Article
          </button>
        )}
      </div>

      {/* Prominent search bar — navigates to SearchResults page */}
      <div style={{ marginBottom: 20 }}>
        <SearchBar />
      </div>

      <div className="filters-row">
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {ARTICLE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="article-grid">
        {loading && <p className="table-empty">Loading...</p>}
        {!loading && data?.data.length === 0 && (
          <p className="table-empty">No articles found.</p>
        )}
        {!loading && data?.data.map((article) => (
          <div
            key={article.id}
            className="article-card"
            onClick={() => navigate(`/plant-care/articles/${article.id}`)}
          >
            <div className="article-card-header">
              <span className="article-category-badge">
                {getCategoryLabel(article.category)}
              </span>
              <span className={`status-badge ${getStatusClass(article.status)}`}>
                {getStatusLabel(article.status)}
              </span>
            </div>
            <h3 className="article-card-title">{article.title}</h3>
            <p className="article-card-excerpt">
              {article.content.slice(0, 120)}{article.content.length > 120 ? '…' : ''}
            </p>
            {article.tags.length > 0 && (
              <div className="article-tags">
                {article.tags.map((tag) => (
                  <span key={tag} className="article-tag">{tag}</span>
                ))}
              </div>
            )}
            <div className="article-card-meta">
              {article.author
                ? `${article.author.firstName} ${article.author.lastName}`
                : 'Unknown'
              } &mdash; {new Date(article.updatedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-text">
            Previous
          </button>
          <span>Page {data.meta.page} of {data.meta.totalPages}</span>
          <button
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-text"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
