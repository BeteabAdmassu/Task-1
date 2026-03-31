import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchPortalPo, PurchaseOrderRecord } from '../api/purchase-orders';
import { getPoStatusLabel, getPoStatusClass } from '../utils/po-status';

export function SupplierPortalPoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [po, setPo] = useState<PurchaseOrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchPortalPo(id)
      .then(setPo)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!po) return <div className="page"><div className="error-banner">{error}</div></div>;

  const receivedTotal = po.lineItems.reduce((s, li) => s + Number(li.quantityReceived), 0);
  const orderedTotal = po.lineItems.reduce((s, li) => s + Number(li.quantity), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{po.poNumber}</h1>
          <span className={`status-badge ${getPoStatusClass(po.status)}`}>
            {getPoStatusLabel(po.status)}
          </span>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/supplier-portal/purchase-orders')}>
          Back to Orders
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="detail-form" style={{ marginTop: 20 }}>
        <dl className="detail-list">
          <dt>Total Amount</dt>
          <dd>${Number(po.totalAmount).toFixed(2)}</dd>
          <dt>Issued At</dt>
          <dd>{po.issuedAt ? new Date(po.issuedAt).toLocaleString() : '—'}</dd>
          <dt>Expected Delivery</dt>
          <dd>{po.expectedDeliveryDate || '—'}</dd>
          <dt>Notes</dt>
          <dd>{po.notes || '—'}</dd>
        </dl>
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 12 }}>Line Items</h3>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Ordered Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th>Received Qty</th>
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.description}</td>
                <td>{Number(li.quantity)}</td>
                <td>${Number(li.unitPrice).toFixed(2)}</td>
                <td>${Number(li.totalPrice).toFixed(2)}</td>
                <td>{Number(li.quantityReceived)} / {Number(li.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right"><strong>Total:</strong></td>
              <td><strong>${Number(po.totalAmount).toFixed(2)}</strong></td>
              <td>{receivedTotal.toFixed(2)} / {orderedTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
