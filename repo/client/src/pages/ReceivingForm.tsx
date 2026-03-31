import { useState, useEffect, useRef, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPos, PurchaseOrderRecord, PoLineItem } from '../api/purchase-orders';
import {
  fetchPutawayLocations,
  createReceipt,
  completeReceipt,
  PutawayLocationRecord,
} from '../api/receiving';

const VARIANCE_REASONS = [
  { value: 'NONE', label: 'No Variance' },
  { value: 'SHORT_SHIPMENT', label: 'Short Shipment' },
  { value: 'OVER_SHIPMENT', label: 'Over Shipment' },
  { value: 'DAMAGED', label: 'Damaged Goods' },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
  { value: 'OTHER', label: 'Other' },
];

interface LineState {
  poLineItem: PoLineItem;
  quantityExpected: number;
  quantityReceived: string;
  varianceReasonCode: string;
  varianceNotes: string;
  putawayLocationId: string;
}

export function ReceivingForm() {
  const navigate = useNavigate();
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [locations, setLocations] = useState<PutawayLocationRecord[]>([]);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [lines, setLines] = useState<LineState[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Load ISSUED + PARTIALLY_RECEIVED POs
    Promise.all([
      fetchPos({ status: 'ISSUED', limit: '100' }),
      fetchPos({ status: 'PARTIALLY_RECEIVED', limit: '100' }),
      fetchPutawayLocations(),
    ]).then(([issued, partial, locs]) => {
      setPos([...issued.data, ...partial.data]);
      setLocations(locs);
    }).catch((err) => setError(err.message));
  }, []);

  const handlePoSelect = (poId: string) => {
    setSelectedPoId(poId);
    const po = pos.find((p) => p.id === poId);
    if (!po) { setLines([]); return; }
    setLines(
      po.lineItems.map((li) => ({
        poLineItem: li,
        quantityExpected: Math.max(0, Number(li.quantity) - Number(li.quantityReceived)),
        quantityReceived: String(Math.max(0, Number(li.quantity) - Number(li.quantityReceived))),
        varianceReasonCode: 'NONE',
        varianceNotes: '',
        putawayLocationId: '',
      })),
    );
  };

  const updateLine = (index: number, field: keyof LineState, value: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = inputRefs.current[index + 1];
      if (next) next.focus();
    }
  };

  const variance = (line: LineState) =>
    Number(line.quantityReceived) - line.quantityExpected;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    for (const line of lines) {
      const v = variance(line);
      if (v !== 0 && line.varianceReasonCode === 'NONE') {
        setError(`Variance detected on "${line.poLineItem.description}" — select a reason code`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const receipt = await createReceipt({
        poId: selectedPoId,
        notes: notes || undefined,
        lineItems: lines.map((l) => ({
          poLineItemId: l.poLineItem.id,
          quantityExpected: l.quantityExpected,
          quantityReceived: Number(l.quantityReceived),
          varianceReasonCode: l.varianceReasonCode !== 'NONE' ? l.varianceReasonCode : undefined,
          varianceNotes: l.varianceNotes || undefined,
          putawayLocationId: l.putawayLocationId || undefined,
        })),
      });
      await completeReceipt(receipt.id);
      navigate('/warehouse/receipts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit receipt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Receive Goods</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="detail-form" style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Purchase Order *</label>
              <select
                value={selectedPoId}
                onChange={(e) => handlePoSelect(e.target.value)}
                required
                className="filter-select"
              >
                <option value="">— Select a PO —</option>
                {pos.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} ({po.status}) — {po.supplier?.name || 'Unknown Supplier'}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group form-group-full">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </div>

        {lines.length > 0 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Line Items</h3>
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Expected Qty</th>
                    <th>Received Qty</th>
                    <th>Variance</th>
                    <th>Reason Code</th>
                    <th>Putaway Location</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const v = variance(line);
                    const hasVariance = v !== 0;
                    return (
                      <tr key={line.poLineItem.id}>
                        <td>{line.poLineItem.description}</td>
                        <td>{line.quantityExpected}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantityReceived}
                            onChange={(e) => updateLine(i, 'quantityReceived', e.target.value)}
                            onKeyDown={(e) => handleQtyKeyDown(e, i)}
                            ref={(el) => { inputRefs.current[i] = el; }}
                            style={{ width: 80 }}
                            required
                          />
                        </td>
                        <td style={{ color: hasVariance ? '#c62828' : 'inherit' }}>
                          {isNaN(v) ? '—' : (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
                        </td>
                        <td>
                          <select
                            value={line.varianceReasonCode}
                            onChange={(e) => updateLine(i, 'varianceReasonCode', e.target.value)}
                            required={hasVariance}
                            className="filter-select"
                          >
                            {VARIANCE_REASONS.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={line.putawayLocationId}
                            onChange={(e) => updateLine(i, 'putawayLocationId', e.target.value)}
                            className="filter-select"
                          >
                            <option value="">— None —</option>
                            {locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.code}{loc.zone ? ` (${loc.zone})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="form-actions" style={{ marginTop: 20 }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Complete Receiving'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate('/warehouse/receipts')}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
