import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchRequest, createRequest, updateRequest, submitRequest, PurchaseRequestRecord } from '../api/procurement';
import { fetchSupplierDropdown, SupplierDropdownItem } from '../api/suppliers';

interface LineItemRow {
  itemDescription: string;
  quantity: number;
  unitPrice: number;
}

const emptyRow = (): LineItemRow => ({ itemDescription: '', quantity: 1, unitPrice: 0 });

function tierLabel(tier: number) {
  if (tier === 0) return 'Auto-approve (≤ $500)';
  if (tier === 1) return 'Single approval ($500–$5,000)';
  return 'Dual approval (> $5,000)';
}

export function RequestForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyRow()]);
  const [suppliers, setSuppliers] = useState<SupplierDropdownItem[]>([]);
  const [existing, setExisting] = useState<PurchaseRequestRecord | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSupplierDropdown().then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isNew && id) {
      setLoading(true);
      fetchRequest(id)
        .then((r) => {
          setExisting(r);
          setTitle(r.title);
          setDescription(r.description || '');
          setSupplierId(r.supplierId || '');
          setLineItems(
            r.lineItems.map((li) => ({
              itemDescription: li.itemDescription,
              quantity: Number(li.quantity),
              unitPrice: Number(li.unitPrice),
            })),
          );
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const totalAmount = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const approvalTier = totalAmount <= 500 ? 0 : totalAmount <= 5000 ? 1 : 2;

  const updateLine = (idx: number, field: keyof LineItemRow, value: string | number) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [field]: value } : li)));
  };

  const addLine = () => setLineItems((prev) => [...prev, emptyRow()]);
  const removeLine = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      title,
      description: description || undefined,
      supplierId: supplierId || undefined,
      lineItems: lineItems.filter((li) => li.itemDescription.trim()).map((li) => ({
        itemDescription: li.itemDescription,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
    };

    try {
      if (isNew) {
        const created = await createRequest(payload);
        navigate(`/procurement/requests/${created.id}`, { replace: true });
      } else {
        await updateRequest(id!, payload);
        const updated = await fetchRequest(id!);
        setExisting(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!existing) return;
    setError(null);
    setSaving(true);
    try {
      const result = await submitRequest(existing.id);
      setExisting(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;

  const isDraft = !existing || existing.status === 'DRAFT';

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isNew ? 'New Purchase Request' : `Request ${existing?.requestNumber || ''}`}</h1>
        <button className="btn-secondary" onClick={() => navigate('/procurement/requests')}>Back to List</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {existing && !isDraft && (
        <div className="info-banner">
          Status: <strong>{existing.status.replace(/_/g, ' ')}</strong>
          {' — '}Tier: {tierLabel(existing.approvalTier)}
        </div>
      )}

      <form className="detail-form" onSubmit={handleSave}>
        <div className="form-grid">
          <div className="form-group">
            <label>Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!isDraft} />
          </div>
          <div className="form-group">
            <label>Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!isDraft}>
              <option value="">— None —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group form-group-full">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={!isDraft} />
          </div>
        </div>

        <h3 style={{ marginTop: 20, marginBottom: 12 }}>Line Items</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ width: 100 }}>Qty</th>
              <th style={{ width: 120 }}>Unit Price</th>
              <th style={{ width: 120 }}>Total</th>
              {isDraft && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, idx) => (
              <tr key={idx}>
                <td>
                  <input type="text" value={li.itemDescription}
                    onChange={(e) => updateLine(idx, 'itemDescription', e.target.value)}
                    placeholder="Item description" disabled={!isDraft} className="table-input" />
                </td>
                <td>
                  <input type="number" value={li.quantity} min={0.01} step="any"
                    onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    disabled={!isDraft} className="table-input" />
                </td>
                <td>
                  <input type="number" value={li.unitPrice} min={0} step="0.01"
                    onChange={(e) => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    disabled={!isDraft} className="table-input" />
                </td>
                <td className="text-right">${(li.quantity * li.unitPrice).toFixed(2)}</td>
                {isDraft && (
                  <td>
                    {lineItems.length > 1 && (
                      <button type="button" className="btn-text" onClick={() => removeLine(idx)}>X</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right"><strong>Total:</strong></td>
              <td className="text-right"><strong>${totalAmount.toFixed(2)}</strong></td>
              {isDraft && <td></td>}
            </tr>
          </tfoot>
        </table>

        {isDraft && (
          <button type="button" className="btn-text" onClick={addLine} style={{ marginTop: 8 }}>
            + Add Line Item
          </button>
        )}

        <div className="info-banner" style={{ marginTop: 16 }}>
          Approval tier: <strong>{tierLabel(approvalTier)}</strong>
        </div>

        {isDraft && (
          <div className="form-actions">
            <button type="submit" className="btn-secondary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            {existing && (
              <button type="button" className="btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
                Submit for Approval
              </button>
            )}
          </div>
        )}
      </form>

      {existing && existing.approvals && existing.approvals.length > 0 && (
        <div className="approval-history">
          <h3>Approval History</h3>
          <div className="timeline">
            {existing.approvals.map((a) => (
              <div key={a.id} className={`timeline-item ${a.action.toLowerCase()}`}>
                <div className="timeline-header">
                  <strong>{a.approver?.username || 'Unknown'}</strong>
                  <span className={`status-badge status-${a.action.toLowerCase()}`}>{a.action}</span>
                  <span className="timeline-date">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                {a.comments && <p className="timeline-comments">{a.comments}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
