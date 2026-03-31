import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchReturn,
  submitReturn,
  updateReturnStatus,
  ReturnAuthorizationRecord,
} from '../api/returns';
import { getReturnStatusLabel, getReturnStatusClass, getReturnReasonLabel } from '../utils/return-status';

const STATUS_FLOW = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SHIPPED', 'COMPLETED'];

export function ReturnDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ra, setRa] = useState<ReturnAuthorizationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setRa(await fetchReturn(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const act = async (fn: () => Promise<ReturnAuthorizationRecord>) => {
    setActing(true);
    setError(null);
    try {
      setRa(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!ra) return <div className="page"><div className="error-banner">{error}</div></div>;

  const totalFee = ra.lineItems.reduce((s, li) => s + Number(li.restockingFeeAmount), 0);
  const totalRefund = ra.lineItems.reduce((s, li) => s + Number(li.refundAmount), 0);
  const isDraft = ra.status === 'DRAFT';
  const isSubmitted = ra.status === 'SUBMITTED';
  const isApproved = ra.status === 'APPROVED';
  const isShipped = ra.status === 'SHIPPED';
  const isCancellable = ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(ra.status);
  const isFinal = ra.status === 'COMPLETED' || ra.status === 'CANCELLED';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{ra.raNumber}</h1>
          <span className={`status-badge ${getReturnStatusClass(ra.status)}`}>
            {getReturnStatusLabel(ra.status)}
          </span>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/procurement/returns')}>
          Back to List
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Status timeline */}
      <div className="status-timeline" style={{ marginTop: 16, marginBottom: 20 }}>
        {STATUS_FLOW.map((s, i) => {
          const idx = STATUS_FLOW.indexOf(ra.status);
          const done = i < idx || ra.status === 'COMPLETED';
          const current = s === ra.status;
          return (
            <span
              key={s}
              className={`timeline-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}
            >
              {getReturnStatusLabel(s)}
            </span>
          );
        })}
      </div>

      {/* Actions */}
      {!isFinal && (
        <div className="po-actions" style={{ marginBottom: 16 }}>
          {isDraft && (
            <button
              className="btn-primary btn-sm"
              disabled={acting}
              onClick={() => act(() => submitReturn(ra.id))}
            >
              Submit
            </button>
          )}
          {isSubmitted && (
            <button
              className="btn-primary btn-sm"
              disabled={acting}
              onClick={() => act(() => updateReturnStatus(ra.id, 'APPROVED'))}
            >
              Approve
            </button>
          )}
          {isApproved && (
            <button
              className="btn-primary btn-sm"
              disabled={acting}
              onClick={() => act(() => updateReturnStatus(ra.id, 'SHIPPED'))}
            >
              Mark Shipped
            </button>
          )}
          {isShipped && (
            <button
              className="btn-primary btn-sm"
              disabled={acting}
              onClick={() => act(() => updateReturnStatus(ra.id, 'COMPLETED'))}
            >
              Complete
            </button>
          )}
          {isCancellable && (
            <button
              className="btn-secondary"
              disabled={acting}
              onClick={() => act(() => updateReturnStatus(ra.id, 'CANCELLED'))}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Details */}
      <div className="detail-form">
        <dl className="detail-list">
          <dt>Receipt</dt>
          <dd>{ra.receipt?.receiptNumber || '—'}</dd>
          <dt>Supplier</dt>
          <dd>{ra.supplier?.name || '—'}</dd>
          <dt>Return Deadline</dt>
          <dd>{ra.returnDeadline} ({ra.returnWindowDays}-day window)</dd>
          <dt>Created By</dt>
          <dd>{ra.creator ? `${ra.creator.firstName} ${ra.creator.lastName}` : '—'}</dd>
          <dt>Created At</dt>
          <dd>{new Date(ra.createdAt).toLocaleString()}</dd>
        </dl>
      </div>

      {/* Line items */}
      <h3 style={{ marginTop: 24, marginBottom: 12 }}>Line Items</h3>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty Returned</th>
              <th>Reason</th>
              <th>Fee %</th>
              <th>Fee Amount</th>
              <th>Refund Amount</th>
            </tr>
          </thead>
          <tbody>
            {ra.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.receiptLineItem?.poLineItem?.description || '—'}</td>
                <td>{Number(li.quantityReturned)}</td>
                <td>{getReturnReasonLabel(li.reasonCode)}</td>
                <td>{Number(li.restockingFeePercent)}%</td>
                <td>${Number(li.restockingFeeAmount).toFixed(2)}</td>
                <td>${Number(li.refundAmount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="text-right"><strong>Total:</strong></td>
              <td><strong>${totalFee.toFixed(2)}</strong></td>
              <td><strong>${totalRefund.toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
