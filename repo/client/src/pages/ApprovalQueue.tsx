import { useState, useEffect, useCallback } from 'react';
import { fetchApprovalQueue, processApproval, PaginatedRequests, PurchaseRequestRecord } from '../api/procurement';
import { useAuth } from '../contexts/AuthContext';

function tierLabel(tier: number) {
  if (tier === 0) return 'Auto';
  if (tier === 1) return 'Single';
  return 'Dual';
}

export function ApprovalQueue() {
  const { user } = useAuth();
  const [data, setData] = useState<PaginatedRequests | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchApprovalQueue({ page: String(page), limit: '20' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
    setProcessing(true);
    setError(null);
    try {
      await processApproval(requestId, action, comments || undefined);
      setActiveRequest(null);
      setComments('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process');
    } finally {
      setProcessing(false);
    }
  };

  const canApprove = (r: PurchaseRequestRecord) => {
    if (r.requestedBy === user?.id) return false;
    const alreadyApproved = r.approvals?.some(
      (a) => a.approverId === user?.id && a.action === 'APPROVE',
    );
    return !alreadyApproved;
  };

  const approvalsNeeded = (r: PurchaseRequestRecord) => {
    const required = r.approvalTier === 2 ? 2 : 1;
    const current = r.approvals?.filter((a) => a.action === 'APPROVE').length || 0;
    return `${current}/${required}`;
  };

  return (
    <div className="page">
      <h1>Approval Queue</h1>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Title</th>
              <th>Requester</th>
              <th>Total</th>
              <th>Tier</th>
              <th>Approvals</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="table-empty">Loading...</td></tr>}
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={7} className="table-empty">No pending approvals.</td></tr>
            )}
            {!loading && data?.data.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.requestNumber}</strong></td>
                <td>{r.title}</td>
                <td>{r.requester?.username || '—'}</td>
                <td>${Number(r.totalAmount).toFixed(2)}</td>
                <td>{tierLabel(r.approvalTier)}</td>
                <td>{approvalsNeeded(r)}</td>
                <td>
                  {canApprove(r) ? (
                    activeRequest === r.id ? (
                      <div className="approval-actions">
                        <textarea
                          value={comments}
                          onChange={(e) => setComments(e.target.value)}
                          placeholder="Comments (optional)"
                          rows={2}
                          className="approval-comments"
                        />
                        <div className="approval-buttons">
                          <button
                            className="btn-approve"
                            onClick={() => handleAction(r.id, 'APPROVE')}
                            disabled={processing}
                          >
                            Approve
                          </button>
                          <button
                            className="btn-reject"
                            onClick={() => handleAction(r.id, 'REJECT')}
                            disabled={processing}
                          >
                            Reject
                          </button>
                          <button
                            className="btn-text"
                            onClick={() => { setActiveRequest(null); setComments(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn-text" onClick={() => setActiveRequest(r.id)}>
                        Review
                      </button>
                    )
                  ) : (
                    <span className="text-muted">
                      {r.requestedBy === user?.id ? 'Your request' : 'Already reviewed'}
                    </span>
                  )}
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
