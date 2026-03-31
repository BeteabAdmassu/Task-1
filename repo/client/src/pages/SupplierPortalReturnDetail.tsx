import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchPortalReturn, ReturnAuthorizationRecord } from '../api/returns';
import { getReturnStatusLabel, getReturnStatusClass, getReturnReasonLabel } from '../utils/return-status';

export function SupplierPortalReturnDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ra, setRa] = useState<ReturnAuthorizationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchPortalReturn(id)
      .then(setRa)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!ra) return <div className="page"><div className="error-banner">{error}</div></div>;

  const totalFee = ra.lineItems.reduce((s, li) => s + Number(li.restockingFeeAmount), 0);
  const totalRefund = ra.lineItems.reduce((s, li) => s + Number(li.refundAmount), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{ra.raNumber}</h1>
          <span className={`status-badge ${getReturnStatusClass(ra.status)}`}>
            {getReturnStatusLabel(ra.status)}
          </span>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/supplier-portal/returns')}>
          Back to Returns
        </button>
      </div>

      <div className="detail-form" style={{ marginTop: 20 }}>
        <dl className="detail-list">
          <dt>Receipt</dt>
          <dd>{ra.receipt?.receiptNumber || '—'}</dd>
          <dt>Return Deadline</dt>
          <dd>{ra.returnDeadline}</dd>
          <dt>Created</dt>
          <dd>{new Date(ra.createdAt).toLocaleString()}</dd>
        </dl>
      </div>

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
