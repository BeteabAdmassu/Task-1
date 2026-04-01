import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPos, PurchaseOrderRecord, PoLineItem } from '../api/purchase-orders';
import {
  fetchPutawayLocations,
  createReceipt,
  completeReceipt,
  PutawayLocationRecord,
  ReceivingEntryMode,
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

/**
 * Derives a scan code for a PO line item.
 * Prefer catalogItemId when available (matches physical barcode labels),
 * otherwise fall back to the first 8 chars of the line item UUID.
 */
function getScanCode(li: PoLineItem): string {
  return li.catalogItemId ? li.catalogItemId : li.id.slice(0, 8).toUpperCase();
}

export function ReceivingForm() {
  const navigate = useNavigate();
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [locations, setLocations] = useState<PutawayLocationRecord[]>([]);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [lines, setLines] = useState<LineState[]>([]);
  const [notes, setNotes] = useState('');
  const [entryMode, setEntryMode] = useState<ReceivingEntryMode>('MANUAL');
  const [scanInput, setScanInput] = useState('');
  const [lastScanFeedback, setLastScanFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const manualInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    Promise.all([
      fetchPos({ status: 'ISSUED', limit: '100' }),
      fetchPos({ status: 'PARTIALLY_RECEIVED', limit: '100' }),
      fetchPutawayLocations(),
    ]).then(([issued, partial, locs]) => {
      // Deduplicate by PO id — a PO may appear in both ISSUED and
      // PARTIALLY_RECEIVED results if its status changed between requests.
      const combined = [...issued.data, ...partial.data];
      const seen = new Set<string>();
      const unique = combined.filter((po) => {
        if (seen.has(po.id)) return false;
        seen.add(po.id);
        return true;
      });
      setPos(unique);
      setLocations(locs);
    }).catch((err) => setError(err.message));
  }, []);

  // Auto-focus scan input whenever barcode mode is active and a PO is selected
  useEffect(() => {
    if (entryMode === 'BARCODE' && selectedPoId && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [entryMode, selectedPoId]);

  const handlePoSelect = (poId: string) => {
    setSelectedPoId(poId);
    setLastScanFeedback(null);
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

  const handleManualQtyKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = manualInputRefs.current[index + 1];
      if (next) next.focus();
    }
  };

  /**
   * Barcode scan handler.
   * Matches the scanned code against each line's scan code (catalogItemId or UUID prefix).
   * On match, increments quantityReceived by 1.
   */
  const handleScan = useCallback(() => {
    const code = scanInput.trim();
    if (!code) return;

    const idx = lines.findIndex(
      (l) => getScanCode(l.poLineItem).toUpperCase() === code.toUpperCase(),
    );

    if (idx === -1) {
      setLastScanFeedback(`No match for code "${code}"`);
    } else {
      const line = lines[idx];
      const newQty = String(Number(line.quantityReceived) + 1);
      setLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, quantityReceived: newQty } : l)),
      );
      setLastScanFeedback(
        `Scanned: ${line.poLineItem.description} — Qty now ${newQty}`,
      );
    }

    setScanInput('');
    // Re-focus for next scan
    scanInputRef.current?.focus();
  }, [scanInput, lines]);

  const handleScanKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan();
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
        entryMode,
        notes: notes || undefined,
        lineItems: lines.map((l) => ({
          poLineItemId: l.poLineItem.id,
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

            <div className="form-group">
              <label>Entry Mode</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="entryMode"
                    value="MANUAL"
                    checked={entryMode === 'MANUAL'}
                    onChange={() => { setEntryMode('MANUAL'); setLastScanFeedback(null); }}
                  />
                  Manual Entry
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="entryMode"
                    value="BARCODE"
                    checked={entryMode === 'BARCODE'}
                    onChange={() => setEntryMode('BARCODE')}
                  />
                  Barcode Scan
                </label>
              </div>
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

        {/* Barcode scan input — shown only in BARCODE mode once a PO is selected */}
        {entryMode === 'BARCODE' && selectedPoId && (
          <div className="detail-form" style={{ marginBottom: 24 }}>
            <div className="form-group">
              <label htmlFor="barcode-scan-input">
                Scan Barcode
                <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#666' }}>
                  (scan or type code and press Enter)
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="barcode-scan-input"
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  ref={scanInputRef}
                  placeholder="Ready to scan…"
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleScan}
                  disabled={!scanInput.trim()}
                >
                  Confirm
                </button>
              </div>
              {lastScanFeedback && (
                <p
                  style={{
                    marginTop: 6,
                    fontSize: '0.875rem',
                    color: lastScanFeedback.startsWith('No match') ? '#c62828' : '#2e7d32',
                  }}
                  aria-live="polite"
                  data-testid="scan-feedback"
                >
                  {lastScanFeedback}
                </p>
              )}
            </div>
          </div>
        )}

        {lines.length > 0 && (
          <>
            <h3 style={{ marginBottom: 12 }}>Line Items</h3>
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    {entryMode === 'BARCODE' && <th>Scan Code</th>}
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
                        {entryMode === 'BARCODE' && (
                          <td>
                            <code style={{ fontSize: '0.8rem' }}>
                              {getScanCode(line.poLineItem)}
                            </code>
                          </td>
                        )}
                        <td>{line.quantityExpected}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantityReceived}
                            onChange={(e) => updateLine(i, 'quantityReceived', e.target.value)}
                            onKeyDown={(e) =>
                              entryMode === 'MANUAL' ? handleManualQtyKeyDown(e, i) : undefined
                            }
                            ref={(el) => { manualInputRefs.current[i] = el; }}
                            style={{ width: 80 }}
                            required
                            aria-label={`Received quantity for ${line.poLineItem.description}`}
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
