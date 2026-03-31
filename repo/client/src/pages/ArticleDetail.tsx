import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchArticle,
  fetchArticleVersions,
  addFavorite,
  removeFavorite,
  isFavorited,
  ArticleRecord,
  ArticleVersionRecord,
} from '../api/knowledge-base';
import { fetchSimilarArticles, SimilarArticle } from '../api/search';
import { getCategoryLabel, getStatusLabel, getStatusClass } from '../utils/article';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'content' | 'history';

export function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMINISTRATOR';

  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [versions, setVersions] = useState<ArticleVersionRecord[]>([]);
  const [similar, setSimilar] = useState<SimilarArticle[]>([]);
  const [tab, setTab] = useState<Tab>('content');
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [favLoading, setFavLoading] = useState(false);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [a, fav, sim] = await Promise.all([
        fetchArticle(id),
        isFavorited(id),
        fetchSimilarArticles(id),
      ]);
      setArticle(a);
      setFavorited(fav);
      setSimilar(sim);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadVersions = useCallback(async () => {
    if (!id) return;
    try {
      setVersions(await fetchArticleVersions(id));
    } catch {
      // non-critical
    }
  }, [id]);

  useEffect(() => {
    if (tab === 'history') loadVersions();
  }, [tab, loadVersions]);

  const toggleFavorite = async () => {
    if (!id || favLoading) return;
    setFavLoading(true);
    try {
      if (favorited) {
        await removeFavorite(id);
        setFavorited(false);
      } else {
        await addFavorite(id);
        setFavorited(true);
      }
    } catch {
      // ignore
    } finally {
      setFavLoading(false);
    }
  };

  const handleOfflineCache = async () => {
    if (!id) return;
    try {
      const cache = await caches.open('greenleaf-kb-v1');
      const res = await fetch(`/api/articles/${id}`);
      if (res.ok) await cache.put(`/api/articles/${id}`, res);
      alert('Article saved for offline access.');
    } catch {
      alert('Failed to cache article.');
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (error) return <div className="page"><div className="error-banner">{error}</div></div>;
  if (!article) return null;

  return (
    <div className="page">
      {offline && (
        <div className="offline-banner">
          You are offline. Showing cached content.
        </div>
      )}

      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <button className="btn-text" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
            &larr; Back
          </button>
          <h2>{article.title}</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <span className="article-category-badge">
              {getCategoryLabel(article.category)}
            </span>
            <span className={`status-badge ${getStatusClass(article.status)}`}>
              {getStatusLabel(article.status)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <button
            className={favorited ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'}
            onClick={toggleFavorite}
            disabled={favLoading}
          >
            {favorited ? 'Unfavorite' : 'Favorite'}
          </button>
          <button className="btn-outline btn-sm" onClick={handleOfflineCache}>
            Save Offline
          </button>
          {isAdmin && (
            <button
              className="btn-primary btn-sm"
              onClick={() => navigate(`/plant-care/articles/${article.id}/edit`)}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab${tab === 'content' ? ' active' : ''}`}
          onClick={() => setTab('content')}
        >
          Content
        </button>
        <button
          className={`admin-tab${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          Version History
        </button>
      </div>

      {tab === 'content' && (
        <div className="article-content-body">
          <div className="article-meta-row">
            <span>
              By{' '}
              {article.author
                ? `${article.author.firstName} ${article.author.lastName}`
                : 'Unknown'}
            </span>
            <span>Last updated {new Date(article.updatedAt).toLocaleString()}</span>
          </div>
          {article.tags.length > 0 && (
            <div className="article-tags" style={{ marginBottom: 16 }}>
              {article.tags.map((tag) => (
                <span key={tag} className="article-tag">{tag}</span>
              ))}
            </div>
          )}
          <pre className="article-markdown">{article.content}</pre>
        </div>
      )}

      {tab === 'content' && similar.length > 0 && (
        <div className="similar-articles">
          <h4 className="similar-articles-title">Similar Articles</h4>
          <div className="similar-articles-list">
            {similar.map((s) => (
              <button
                key={s.id}
                className="similar-article-item"
                onClick={() => navigate(`/plant-care/articles/${s.id}`)}
              >
                <span className="article-category-badge" style={{ fontSize: '0.7rem' }}>
                  {getCategoryLabel(s.category)}
                </span>
                <span className="similar-article-title">{s.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Change Summary</th>
                <th>Author</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {versions.length === 0 && (
                <tr><td colSpan={5} className="table-empty">No versions.</td></tr>
              )}
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{v.versionNumber}</td>
                  <td>{v.title}</td>
                  <td>{v.changeSummary || '—'}</td>
                  <td>
                    {v.creator
                      ? `${v.creator.firstName} ${v.creator.lastName}`
                      : '—'}
                  </td>
                  <td>{new Date(v.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
