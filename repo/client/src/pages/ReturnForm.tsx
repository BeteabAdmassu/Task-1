import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchReceipts, ReceiptRecord } from '../api/receiving';
import { createReturn } from '../api/returns';

const REASON_CODES = [
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
  { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
  { value: 'OVERSTOCK', label: 'Overstock' },
  { value: 'OTHER', label: 'Other' },
];

// Server-side fee preview (mirrors engine logic)
function previewFee(
  reasonCode: string,
  receivedAt: string | null,
  feeDefault = 15,
  feeAfterDays = 20,
  feeThreshold = 7,
): number {
  if (!receivedAt) return feeDefault;
  if (reasonCode === 'DAMAGED' || reasonCode === 'WRONG_ITEM') return 0;
  const days = Math.floor(
    (Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  return days > feeThreshold ? feeAfterDays : feeDefault;
}

interface LineState {
  receiptLineItemId: string;
  description: string;
  unitPrice: number;
  quantityReceived: number;
  selected: boolean;
  quantityToReturn: string;
  reasonCode: string;
  reasonNotes: string;
}

export function ReturnForm() {
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);
  const [lines, setLines] = useState<LineState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReceipts({ limit: '100' })
      .then((r) => setReceipts(r.data.filter((rec) => rec.status === 'COMPLETED')))
      .catch((err) => setError(err.message));
  }, []);

  const handleReceiptSelect = (id: string) => {
    setSelectedReceiptId(id);
    const rec = receipts.find((r) => r.id === id) ?? null;
    setSelectedReceipt(rec);
    if (!rec) { setLines([]); return; }
    setLines(
      rec.lineItems.map((li) => ({
        receiptLineItemId: li.id,
        description: li.poLineItem?.description ?? '—',
        unitPrice: Number(li.poLineItem?.unitPrice ?? 0),
        quantityReceived: Number(li.quantityReceived),
        selected: false,
        quantityToReturn: String(li.quantityReceived),
        reasonCode: 'DAMAGED',
        reasonNotes: '',
      })),
    );
  };

  const updateLine = (index: number, field: keyof LineState, value: string | boolean) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const selected = lines.filter((l) => l.selected);
    if (selected.length === 0) {
      setError('Select at least one line item to return');
      return;
    }
    for (const l of selected) {
      if (Number(l.quantityToReturn) <= 0 || Number(l.quantityToReturn) > l.quantityReceived) {
        setError(`Invalid quantity for "${l.description}"`);
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      const ra = await createReturn({
        receiptId: selectedReceiptId,
        lineItems: selected.map((l) => ({
          receiptLineItemId: l.receiptLineItemId,
          quantityReturned: Number(l.quantityToReturn),
          reasonCode: l.reasonCode,
          reasonNotes: l.reasonNotes || undefined,
        })),
      });
      navigate(`/procurement/returns/${ra.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create return');
    } finally {
      setSubmitting(false);
    }
  };

  const receivedAt = selectedReceipt?.receivedAt ?? null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>New Return Authorization</h1>
        <button className="btn-secondary" onClick={() => navigate('/procurement/returns')}>
          Cancel
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="detail-form" style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Completed Receipt *</label>
              <select
                value={selectedReceiptId}
                onChange={(e) => handleReceiptSelect(e.target.value)}
                required
                className="filter-select"
              >
                <option value="">— Select a receipt —</option>
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.receiptNumber} — {r.purchaseOrder?.poNumber ?? 'No PO'} (received{' '}
                    {r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : '?'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {lines.length > 0 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Select Items to Return</h3>
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Description</th>
                    <th>Received</th>
                    <th>Return Qty</th>
                    <th>Reason</th>
                    <th>Est. Fee %</th>
                    <th>Est. Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const fee = previewFee(line.reasonCode, receivedAt);
                    const gross = Number(line.quantityToReturn) * line.unitPrice;
                    const refund = isNaN(gross) ? 0 : gross * (1 - fee / 100);
                    return (
                      <tr key={line.receiptLineItemId} style={{ opacity: line.selected ? 1 : 0.6 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={line.selected}
                            onChange={(e) => updateLine(i, 'selected', e.target.checked)}
                          />
                        </td>
                        <td>{line.description}</td>
                        <td>{line.quantityReceived}</td>
                        <td>
                          <input
                            type="number"
                            min="0.01"
                            max={line.quantityReceived}
                            step="0.01"
                            value={line.quantityToReturn}
                            onChange={(e) => updateLine(i, 'quantityToReturn', e.target.value)}
                            disabled={!line.selected}
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <select
                            value={line.reasonCode}
                            onChange={(e) => updateLine(i, 'reasonCode', e.target.value)}
                            disabled={!line.selected}
                            className="filter-select"
                          >
                            {REASON_CODES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>{fee}%</td>
                        <td>${refund.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="form-actions" style={{ marginTop: 20 }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Return Authorization'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
