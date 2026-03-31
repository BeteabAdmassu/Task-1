import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchReceipts, PaginatedReceipts } from '../api/receiving';

export function ReceiptList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<PaginatedReceipts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const poId = searchParams.get('poId') || '';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (poId) params.poId = poId;
      setData(await fetchReceipts(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, poId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Receiving Records</h1>
        <button className="btn-primary" onClick={() => navigate('/warehouse/receive')}>
          New Receipt
        </button>
      </div>

      {poId && (
        <div style={{ marginBottom: 12, fontSize: '0.9rem', color: '#555' }}>
          Filtered by PO: <strong>{poId}</strong>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>PO Number</th>
              <th>Received By</th>
              <th>Received At</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="table-empty">Loading...</td></tr>
            )}
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={5} className="table-empty">No receiving records found.</td></tr>
            )}
            {!loading && data?.data.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.receiptNumber}</strong></td>
                <td>{r.purchaseOrder?.poNumber || '—'}</td>
                <td>
                  {r.receiver
                    ? `${r.receiver.firstName} ${r.receiver.lastName}`
                    : '—'}
                </td>
                <td>
                  {r.receivedAt
                    ? new Date(r.receivedAt).toLocaleString()
                    : '—'}
                </td>
                <td>
                  <span className={`status-badge ${r.status === 'COMPLETED' ? 'status-approved' : 'status-pending_approval'}`}>
                    {r.status === 'COMPLETED' ? 'Completed' : 'In Progress'}
                  </span>
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
