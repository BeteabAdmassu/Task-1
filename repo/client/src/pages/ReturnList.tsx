import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchReturns, PaginatedReturns } from '../api/returns';
import { getReturnStatusLabel, getReturnStatusClass } from '../utils/return-status';

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SHIPPED', 'COMPLETED', 'CANCELLED'];

export function ReturnList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedReturns | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setData(await fetchReturns(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Return Authorizations</h2>
        <button className="btn-primary btn-sm" onClick={() => navigate('/procurement/returns/new')}>
          New Return
        </button>
      </div>

      <div className="filters-row">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="filter-select"
        >
          <option value="">All Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{getReturnStatusLabel(s)}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="filter-select"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="filter-select"
          placeholder="To"
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>RA Number</th>
              <th>Receipt</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Deadline</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="table-empty">Loading...</td></tr>}
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={7} className="table-empty">No return authorizations found.</td></tr>
            )}
            {!loading && data?.data.map((ra) => (
              <tr key={ra.id}>
                <td><strong>{ra.raNumber}</strong></td>
                <td>{ra.receipt?.receiptNumber || '—'}</td>
                <td>{ra.supplier?.name || '—'}</td>
                <td>
                  <span className={`status-badge ${getReturnStatusClass(ra.status)}`}>
                    {getReturnStatusLabel(ra.status)}
                  </span>
                </td>
                <td>{ra.returnDeadline}</td>
                <td>{new Date(ra.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn-text"
                    onClick={() => navigate(`/procurement/returns/${ra.id}`)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
