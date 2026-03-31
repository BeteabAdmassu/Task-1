import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchDQSummary,
  fetchDuplicates,
  fetchQualityIssues,
  runQualityCheck,
  dismissDuplicate,
  DuplicateCandidate,
  DataQualityIssue,
  DQSummary,
} from '../api/data-quality';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  MISSING_SUPPLIER_EMAIL: 'Missing Email',
  MISSING_PAYMENT_TERMS: 'Missing Payment Terms',
  DUPLICATE_SUPPLIER: 'Duplicate Supplier',
  OUTLIER_PRICING: 'Outlier Pricing',
};

export function DataQualityDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DQSummary | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d, q] = await Promise.all([
        fetchDQSummary(),
        fetchDuplicates({ status: 'PENDING_REVIEW' }),
        fetchQualityIssues(),
      ]);
      setSummary(s);
      setDuplicates(d);
      setIssues(q?.issues ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRunCheck = async () => {
    setRunning(true);
    try {
      const report = await runQualityCheck();
      setIssues(report.issues);
      setSummary((prev) => prev ? { ...prev, issuesFound: report.issues.length, lastCheckedAt: report.checkedAt, counts: report.counts } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setRunning(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissDuplicate(id);
      setDuplicates((prev) => prev.filter((d) => d.id !== id));
      setSummary((prev) => prev ? { ...prev, pendingDuplicates: Math.max(0, prev.pendingDuplicates - 1) } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to dismiss');
    }
  };

  if (loading) return <div className="page"><p>Loading…</p></div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h2>Data Quality Dashboard</h2>
        <button className="btn-primary btn-sm" onClick={handleRunCheck} disabled={running}>
          {running ? 'Running…' : 'Run Quality Check'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Summary cards */}
      <div className="dq-summary-grid">
        <div className="dq-card">
          <div className="dq-card-value dq-warn">{summary?.pendingDuplicates ?? 0}</div>
          <div className="dq-card-label">Pending Duplicates</div>
        </div>
        <div className="dq-card">
          <div className="dq-card-value">{summary?.issuesFound ?? '—'}</div>
          <div className="dq-card-label">Quality Issues</div>
        </div>
        <div className="dq-card">
          <div className="dq-card-value dq-info">{summary?.counts?.missingEmail ?? '—'}</div>
          <div className="dq-card-label">Missing Emails</div>
        </div>
        <div className="dq-card">
          <div className="dq-card-value dq-danger">{summary?.counts?.outlierPricing ?? '—'}</div>
          <div className="dq-card-label">Pricing Outliers</div>
        </div>
      </div>

      {summary?.lastCheckedAt && (
        <p className="dq-last-checked">
          Last check: {new Date(summary.lastCheckedAt).toLocaleString()}
        </p>
      )}

      {/* Pending duplicates */}
      <h3 style={{ marginTop: 28, marginBottom: 12 }}>Pending Duplicate Candidates</h3>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Similarity</th>
              <th>Auto-Merge?</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {duplicates.length === 0 && (
              <tr><td colSpan={5} className="table-empty">No pending duplicate candidates.</td></tr>
            )}
            {duplicates.map((d) => (
              <tr key={d.id}>
                <td>{d.entityType}</td>
                <td>
                  <span className={`dq-score-badge ${Number(d.similarityScore) >= 0.97 ? 'dq-score-high' : 'dq-score-medium'}`}>
                    {(Number(d.similarityScore) * 100).toFixed(1)}%
                  </span>
                </td>
                <td>{d.isAutoMergeCandidate ? <span className="dq-auto-badge">Auto-merge</span> : '—'}</td>
                <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-text"
                    onClick={() => navigate(`/admin/duplicates/${d.id}`)}
                  >
                    Review
                  </button>
                  <button className="btn-text btn-danger-text" onClick={() => handleDismiss(d.id)}>
                    Dismiss
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quality issues */}
      <h3 style={{ marginTop: 32, marginBottom: 12 }}>Quality Issues</h3>
      {issues.length === 0 && !running && (
        <p className="table-empty" style={{ padding: '16px 0' }}>
          {summary?.lastCheckedAt ? 'No issues found.' : 'Run a quality check to see issues.'}
        </p>
      )}
      {issues.length > 0 && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Issue Type</th>
                <th>Record</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, i) => (
                <tr key={i}>
                  <td>
                    <span className={`dq-issue-badge dq-issue-${issue.type.toLowerCase().replace(/_/g, '-')}`}>
                      {ISSUE_TYPE_LABELS[issue.type] ?? issue.type}
                    </span>
                  </td>
                  <td>{issue.label}</td>
                  <td style={{ fontSize: '0.8125rem', color: '#555' }}>{issue.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
