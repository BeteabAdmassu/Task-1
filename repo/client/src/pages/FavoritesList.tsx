import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFavorites, ArticleRecord } from '../api/knowledge-base';
import { getCategoryLabel, getStatusLabel, getStatusClass } from '../utils/article';

export function FavoritesList() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setArticles(await fetchFavorites());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncAllFavorites = async () => {
    if (syncing || articles.length === 0) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const cache = await caches.open('greenleaf-kb-v1');
      let count = 0;
      await Promise.all(
        articles.map(async (a) => {
          try {
            const res = await fetch(`/api/articles/${a.id}`);
            if (res.ok) {
              await cache.put(`/api/articles/${a.id}`, res);
              count++;
            }
          } catch {
            // skip individual failures
          }
        }),
      );
      setSyncMessage(`${count} of ${articles.length} article(s) saved for offline access.`);
    } catch {
      setSyncMessage('Failed to sync favorites offline.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>My Favorites</h2>
        <button
          className="btn-secondary btn-sm"
          onClick={syncAllFavorites}
          disabled={syncing || articles.length === 0}
        >
          {syncing ? 'Syncing…' : 'Sync All Favorites Offline'}
        </button>
      </div>

      {syncMessage && <div className="info-banner">{syncMessage}</div>}
      {error && <div className="error-banner">{error}</div>}

      {loading && <p className="table-empty">Loading…</p>}

      {!loading && articles.length === 0 && (
        <p className="table-empty">You have no favorited articles yet.</p>
      )}

      <div className="article-grid">
        {!loading && articles.map((article) => (
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
              {new Date(article.updatedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
