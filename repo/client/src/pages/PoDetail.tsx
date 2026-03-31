import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchPo, issuePo, cancelPo, updatePo, PurchaseOrderRecord } from '../api/purchase-orders';
import { getPoStatusLabel, getPoStatusClass } from '../utils/po-status';

export function PoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [po, setPo] = useState<PurchaseOrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await fetchPo(id);
      setPo(result);
      setNotes(result.notes || '');
      setExpectedDelivery(result.expectedDeliveryDate || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleIssue = async () => {
    if (!po) return;
    setActing(true);
    setError(null);
    try {
      const result = await issuePo(po.id);
      setPo(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue PO');
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    if (!po) return;
    if (!confirm('Are you sure you want to cancel this purchase order?')) return;
    setActing(true);
    setError(null);
    try {
      const result = await cancelPo(po.id);
      setPo(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel PO');
    } finally {
      setActing(false);
    }
  };

  const handleSaveNotes = async (e: FormEvent) => {
    e.preventDefault();
    if (!po) return;
    setActing(true);
    try {
      const result = await updatePo(po.id, {
        notes: notes || undefined,
        expectedDeliveryDate: expectedDelivery || undefined,
      });
      setPo(result);
      setEditingNotes(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!po) return <div className="page"><div className="error-banner">{error}</div></div>;

  const isDraft = po.status === 'DRAFT';
  const isCancellable = ['DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status);
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
        <button className="btn-secondary" onClick={() => navigate('/procurement/purchase-orders')}>
          Back to List
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Actions */}
      <div className="po-actions">
        {isDraft && (
          <button className="btn-primary btn-sm" onClick={handleIssue} disabled={acting}>
            Issue PO
          </button>
        )}
        {isCancellable && (
          <button className="btn-secondary" onClick={handleCancel} disabled={acting}>
            Cancel PO
          </button>
        )}
      </div>

      {/* Details */}
      <div className="detail-form" style={{ marginTop: 20 }}>
        <dl className="detail-list">
          <dt>Supplier</dt>
          <dd>{po.supplier?.name || '—'}</dd>
          <dt>Linked Request</dt>
          <dd>
            {po.request ? (
              <Link to={`/procurement/requests/${po.requestId}`}>{po.request.requestNumber}</Link>
            ) : '—'}
          </dd>
          <dt>Total Amount</dt>
          <dd>${Number(po.totalAmount).toFixed(2)}</dd>
          <dt>Issued At</dt>
          <dd>{po.issuedAt ? new Date(po.issuedAt).toLocaleString() : '—'}</dd>
          <dt>Expected Delivery</dt>
          <dd>{po.expectedDeliveryDate || '—'}</dd>
          <dt>Notes</dt>
          <dd>{po.notes || '—'}</dd>
        </dl>

        {!editingNotes && (
          <button className="btn-text" onClick={() => setEditingNotes(true)} style={{ marginTop: 12 }}>
            Edit Notes / Delivery Date
          </button>
        )}

        {editingNotes && (
          <form onSubmit={handleSaveNotes} style={{ marginTop: 12 }}>
            <div className="form-grid">
              <div className="form-group">
                <label>Expected Delivery Date</label>
                <input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
              </div>
              <div className="form-group form-group-full">
                <label>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary btn-sm" disabled={acting}>Save</button>
              <button type="button" className="btn-secondary" onClick={() => setEditingNotes(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Line Items */}
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

      {/* Receiving summary placeholder */}
      <div className="portal-card portal-card-placeholder" style={{ marginTop: 24 }}>
        <h3>Receiving Records</h3>
        <p className="placeholder-text">Receiving records will appear here once Prompt 7 is implemented.</p>
      </div>
    </div>
  );
}
