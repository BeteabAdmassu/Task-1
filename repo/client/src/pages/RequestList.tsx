import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRequests, PaginatedRequests } from '../api/procurement';

const STATUS_OPTIONS = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'];

function statusLabel(s: string) {
  return s.replace(/_/g, ' ');
}

function tierLabel(tier: number) {
  if (tier === 0) return 'Auto-approve';
  if (tier === 1) return 'Single approval';
  return 'Dual approval';
}

export function RequestList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedRequests | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20', sortBy, sortOrder };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      setData(await fetchRequests(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder((p) => (p === 'ASC' ? 'DESC' : 'ASC'));
    else { setSortBy(field); setSortOrder('ASC'); }
    setPage(1);
  };

  const si = (field: string) => (sortBy !== field ? '' : sortOrder === 'ASC' ? ' ^' : ' v');

  return (
    <div className="page">
      <div className="page-header">
        <h1>Purchase Requests</h1>
        <button className="btn-primary btn-sm" onClick={() => navigate('/procurement/requests/new')}>
          New Request
        </button>
      </div>

      <div className="filters-row">
        <input type="text" placeholder="Search number or title..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="filter-input" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="filter-select">
          <option value="">All Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('requestNumber')} className="sortable">Number{si('requestNumber')}</th>
              <th onClick={() => handleSort('title')} className="sortable">Title{si('title')}</th>
              <th>Supplier</th>
              <th onClick={() => handleSort('totalAmount')} className="sortable">Total{si('totalAmount')}</th>
              <th>Tier</th>
              <th onClick={() => handleSort('status')} className="sortable">Status{si('status')}</th>
              <th onClick={() => handleSort('createdAt')} className="sortable">Created{si('createdAt')}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="table-empty">Loading...</td></tr>}
            {!loading && data?.data.length === 0 && <tr><td colSpan={8} className="table-empty">No requests found.</td></tr>}
            {!loading && data?.data.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.requestNumber}</strong></td>
                <td>{r.title}</td>
                <td>{r.supplier?.name || '—'}</td>
                <td>${Number(r.totalAmount).toFixed(2)}</td>
                <td>{tierLabel(r.approvalTier)}</td>
                <td><span className={`status-badge status-${r.status.toLowerCase()}`}>{statusLabel(r.status)}</span></td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td><button className="btn-text" onClick={() => navigate(`/procurement/requests/${r.id}`)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-text">Previous</button>
          <span>Page {data.meta.page} of {data.meta.totalPages}</span>
          <button disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} className="btn-text">Next</button>
        </div>
      )}
    </div>
  );
}
