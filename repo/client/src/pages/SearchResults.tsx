import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { searchArticles, SearchResult, SearchResponse } from '../api/search';
import { getCategoryLabel, getStatusClass, getStatusLabel, ARTICLE_CATEGORIES } from '../utils/article';

export function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Track connectivity changes reactively
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const load = useCallback(async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchArticles({ q, ...(category ? { category } : {}) }));
    } catch (err) {
      if (!navigator.onLine) {
        setIsOffline(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    } finally {
      setLoading(false);
    }
  }, [q, category]);

  useEffect(() => { load(); }, [load]);

  const setCategory = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set('category', val); else next.delete('category');
    setSearchParams(next);
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>
          Search Results
          {q && <span style={{ fontWeight: 400, color: '#666', fontSize: '1rem' }}> for &ldquo;{q}&rdquo;</span>}
        </h2>
      </div>

      <div className="filters-row">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {ARTICLE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {isOffline && (
        <div className="offline-banner" role="status">
          You are offline — search results may be unavailable or stale. Connect to the
          network and refresh to see up-to-date results.
        </div>
      )}

      {results?.expandedTerms && results.expandedTerms.length > 1 && (
        <div className="search-expanded-terms">
          Also matching: {results.expandedTerms.filter((t) => !q.toLowerCase().includes(t)).join(', ')}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading && <p className="table-empty">Searching…</p>}

      {!loading && results && results.data.length === 0 && (
        <div className="search-no-results">
          <p>No articles found for &ldquo;{q}&rdquo;.</p>
          <button className="btn-text" onClick={() => navigate('/plant-care/articles')}>
            Browse all articles
          </button>
        </div>
      )}

      {!loading && results && results.data.length > 0 && (
        <>
          <p className="search-result-count">{results.total} result{results.total !== 1 ? 's' : ''}</p>
          <div className="search-results-list">
            {results.data.map((r) => (
              <SearchResultCard key={r.id} result={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <Link to={`/plant-care/articles/${result.id}`} className="search-result-card">
      <div className="search-result-header">
        <span className="article-category-badge">{getCategoryLabel(result.category)}</span>
        <span className={`status-badge ${getStatusClass(result.status)}`}>
          {getStatusLabel(result.status)}
        </span>
        <span className="search-result-score">
          {(result.rank * 100).toFixed(0)}% match
        </span>
      </div>
      <h3 className="search-result-title">{result.title}</h3>
      {result.headline && (
        <p
          className="search-result-headline"
          dangerouslySetInnerHTML={{ __html: result.headline }}
        />
      )}
      {result.tags.length > 0 && (
        <div className="article-tags" style={{ marginTop: 8 }}>
          {result.tags.map((tag) => (
            <span key={tag} className="article-tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="article-card-meta" style={{ marginTop: 8 }}>
        {result.author
          ? result.author.username
          : 'Unknown'
        } &mdash; {new Date(result.updatedAt).toLocaleDateString()}
      </div>
    </Link>
  );
}
