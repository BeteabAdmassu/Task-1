import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPortalPos, PaginatedPos } from '../api/purchase-orders';
import { getPoStatusLabel, getPoStatusClass } from '../utils/po-status';

const VISIBLE_STATUSES = ['ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'];

export function SupplierPortalPoList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedPos | null>(null);
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
      setData(await fetchPortalPos(params));
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
        <h2>Purchase Orders</h2>
      </div>

      <div className="filters-row">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="filter-select">
          <option value="">All Status</option>
          {VISIBLE_STATUSES.map((s) => <option key={s} value={s}>{getPoStatusLabel(s)}</option>)}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Total</th>
              <th>Status</th>
              <th>Issued</th>
              <th>Expected Delivery</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="table-empty">Loading...</td></tr>}
            {!loading && data?.data.length === 0 && <tr><td colSpan={6} className="table-empty">No purchase orders found.</td></tr>}
            {!loading && data?.data.map((po) => (
              <tr key={po.id}>
                <td><strong>{po.poNumber}</strong></td>
                <td>${Number(po.totalAmount).toFixed(2)}</td>
                <td><span className={`status-badge ${getPoStatusClass(po.status)}`}>{getPoStatusLabel(po.status)}</span></td>
                <td>{po.issuedAt ? new Date(po.issuedAt).toLocaleDateString() : '—'}</td>
                <td>{po.expectedDeliveryDate || '—'}</td>
                <td>
                  <button className="btn-text" onClick={() => navigate(`/supplier-portal/purchase-orders/${po.id}`)}>
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
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-text">Previous</button>
          <span>Page {data.meta.page} of {data.meta.totalPages}</span>
          <button disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} className="btn-text">Next</button>
        </div>
      )}
    </div>
  );
}
