import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPortalReturns, PaginatedReturns } from '../api/returns';
import { getReturnStatusLabel, getReturnStatusClass } from '../utils/return-status';

const VISIBLE_STATUSES = ['SUBMITTED', 'APPROVED', 'SHIPPED', 'COMPLETED', 'CANCELLED'];

export function SupplierPortalReturns() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedReturns | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      setData(await fetchPortalReturns(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Return Authorizations</h2>
      </div>

      <div className="filters-row">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="filter-select"
        >
          <option value="">All Status</option>
          {VISIBLE_STATUSES.map((s) => (
            <option key={s} value={s}>{getReturnStatusLabel(s)}</option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>RA Number</th>
              <th>Receipt</th>
              <th>Status</th>
              <th>Deadline</th>
              <th>Total Refund</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="table-empty">Loading...</td></tr>}
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={6} className="table-empty">No return authorizations found.</td></tr>
            )}
            {!loading && data?.data.map((ra) => {
              const totalRefund = ra.lineItems.reduce((s, li) => s + Number(li.refundAmount), 0);
              return (
                <tr key={ra.id}>
                  <td><strong>{ra.raNumber}</strong></td>
                  <td>{ra.receipt?.receiptNumber || '—'}</td>
                  <td>
                    <span className={`status-badge ${getReturnStatusClass(ra.status)}`}>
                      {getReturnStatusLabel(ra.status)}
                    </span>
                  </td>
                  <td>{ra.returnDeadline}</td>
                  <td>${totalRefund.toFixed(2)}</td>
                  <td>
                    <button
                      className="btn-text"
                      onClick={() => navigate(`/supplier-portal/returns/${ra.id}`)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
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
