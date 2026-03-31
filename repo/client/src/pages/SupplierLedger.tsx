import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchLedger,
  createDeposit,
  createAdjustment,
  LedgerResponse,
} from '../api/ledger';
import { useAuth } from '../contexts/AuthContext';
import { getLedgerTypeLabel, getLedgerTypeClass, formatAmount } from '../utils/ledger';

export function SupplierLedger() {
  const { id: supplierId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMINISTRATOR';

  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Deposit form
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmt, setDepositAmt] = useState('');
  const [depositDesc, setDepositDesc] = useState('');

  // Adjustment form
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmt, setAdjustAmt] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');

  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    setError(null);
    try {
      setLedger(await fetchLedger(supplierId, { page: String(page), limit: '20' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [supplierId, page]);

  useEffect(() => { load(); }, [load]);

  const handleDeposit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId) return;
    setActing(true);
    setError(null);
    try {
      await createDeposit(supplierId, {
        amount: parseFloat(depositAmt),
        description: depositDesc || undefined,
      });
      setShowDeposit(false);
      setDepositAmt('');
      setDepositDesc('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deposit');
    } finally {
      setActing(false);
    }
  };

  const handleAdjustment = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId) return;
    setActing(true);
    setError(null);
    try {
      await createAdjustment(supplierId, {
        amount: parseFloat(adjustAmt),
        description: adjustDesc,
      });
      setShowAdjust(false);
      setAdjustAmt('');
      setAdjustDesc('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create adjustment');
    } finally {
      setActing(false);
    }
  };

  const summary = ledger?.summary;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Supplier Ledger</h1>
        <button
          className="btn-secondary"
          onClick={() => navigate(`/procurement/suppliers/${supplierId}`)}
        >
          Back to Supplier
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Summary card */}
      {summary && (
        <div className="ledger-summary">
          <div className="ledger-summary-item">
            <span className="ledger-summary-label">Total Deposits</span>
            <span className="ledger-summary-value ledger-positive">
              +${Number(summary.totalDeposits).toFixed(2)}
            </span>
          </div>
          <div className="ledger-summary-item">
            <span className="ledger-summary-label">Total Payments</span>
            <span className="ledger-summary-value ledger-negative">
              -${Number(summary.totalPayments).toFixed(2)}
            </span>
          </div>
          <div className="ledger-summary-item">
            <span className="ledger-summary-label">Total Refunds</span>
            <span className="ledger-summary-value ledger-positive">
              +${Number(summary.totalRefunds).toFixed(2)}
            </span>
          </div>
          <div className="ledger-summary-item ledger-balance-card">
            <span className="ledger-summary-label">Current Balance</span>
            <span className={`ledger-summary-value ${Number(summary.currentBalance) >= 0 ? 'ledger-positive' : 'ledger-negative'}`}>
              ${Number(summary.currentBalance).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Admin actions */}
      {isAdmin && (
        <div className="po-actions" style={{ marginBottom: 16 }}>
          <button
            className="btn-primary btn-sm"
            onClick={() => { setShowDeposit(!showDeposit); setShowAdjust(false); }}
          >
            Record Deposit
          </button>
          <button
            className="btn-secondary"
            onClick={() => { setShowAdjust(!showAdjust); setShowDeposit(false); }}
          >
            Record Adjustment
          </button>
        </div>
      )}

      {showDeposit && (
        <div className="detail-form" style={{ marginBottom: 16 }}>
          <form onSubmit={handleDeposit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Amount ($) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={depositDesc}
                  onChange={(e) => setDepositDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary btn-sm" disabled={acting}>
                {acting ? 'Saving…' : 'Save Deposit'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowDeposit(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showAdjust && (
        <div className="detail-form" style={{ marginBottom: 16 }}>
          <form onSubmit={handleAdjustment}>
            <div className="form-grid">
              <div className="form-group">
                <label>Amount (positive or negative) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustAmt}
                  onChange={(e) => setAdjustAmt(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <input
                  type="text"
                  value={adjustDesc}
                  onChange={(e) => setAdjustDesc(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary btn-sm" disabled={acting}>
                {acting ? 'Saving…' : 'Save Adjustment'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdjust(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entries table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="table-empty">Loading...</td></tr>}
            {!loading && ledger?.data.length === 0 && (
              <tr><td colSpan={6} className="table-empty">No ledger entries yet.</td></tr>
            )}
            {!loading && ledger?.data.map((entry) => (
              <tr key={entry.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td>
                  <span className={`ledger-type-badge ${getLedgerTypeClass(entry.type)}`}>
                    {getLedgerTypeLabel(entry.type)}
                  </span>
                </td>
                <td>{entry.description || '—'}</td>
                <td style={{ fontSize: '0.75rem', color: '#777' }}>
                  {entry.referenceType
                    ? `${entry.referenceType}`
                    : '—'}
                </td>
                <td className={Number(entry.amount) >= 0 ? 'ledger-positive' : 'ledger-negative'}>
                  <strong>{formatAmount(Number(entry.amount))}</strong>
                </td>
                <td>${Number(entry.runningBalance).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ledger && ledger.meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-text">
            Previous
          </button>
          <span>Page {ledger.meta.page} of {ledger.meta.totalPages}</span>
          <button
            disabled={page >= ledger.meta.totalPages}
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
