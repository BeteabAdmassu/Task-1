import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchDuplicateDetail,
  mergeDuplicate,
  dismissDuplicate,
  DuplicateDetail,
} from '../api/data-quality';

export function DuplicateReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DuplicateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setDetail(await fetchDuplicateDetail(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleMerge = async () => {
    if (!id || acting) return;
    if (!confirm('Merge these records? The source will become primary and the target will be soft-deleted. This cannot be undone.')) return;
    setActing(true);
    setError(null);
    try {
      await mergeDuplicate(id);
      navigate('/admin/data-quality');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setActing(false);
    }
  };

  const handleDismiss = async () => {
    if (!id || acting) return;
    setActing(true);
    setError(null);
    try {
      await dismissDuplicate(id);
      navigate('/admin/data-quality');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error && !detail) return <div className="page"><div className="error-banner">{error}</div></div>;
  if (!detail) return null;

  const { candidate, source, target } = detail;
  const isPending = candidate.status === 'PENDING_REVIEW';

  return (
    <div className="page">
      <button className="btn-text" onClick={() => navigate('/admin/data-quality')} style={{ marginBottom: 12 }}>
        &larr; Back to Dashboard
      </button>

      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h2>Duplicate Review — {candidate.entityType}</h2>
          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            <span className={`dq-score-badge ${Number(candidate.similarityScore) >= 0.97 ? 'dq-score-high' : 'dq-score-medium'}`}>
              {(Number(candidate.similarityScore) * 100).toFixed(1)}% similar
            </span>
            {candidate.isAutoMergeCandidate && (
              <span className="dq-auto-badge">High-confidence auto-merge candidate</span>
            )}
            <span className={`status-badge status-${candidate.status.toLowerCase().replace(/_/g, '-')}`}>
              {candidate.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {isPending && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-danger btn-sm" onClick={handleDismiss} disabled={acting}>
              Dismiss
            </button>
            <button className="btn-primary btn-sm" onClick={handleMerge} disabled={acting}>
              {acting ? 'Processing…' : 'Merge (keep Source)'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="dup-comparison">
        <RecordPanel title="Source (Primary if merged)" record={source} entityType={candidate.entityType} />
        <div className="dup-vs">VS</div>
        <RecordPanel title="Target (Will be soft-deleted)" record={target} entityType={candidate.entityType} />
      </div>

      {!isPending && (
        <div className="info-banner" style={{ marginTop: 16 }}>
          This candidate was {candidate.status === 'MERGED' ? 'merged' : 'dismissed'} on{' '}
          {candidate.reviewedAt ? new Date(candidate.reviewedAt).toLocaleString() : '—'}.
        </div>
      )}
    </div>
  );
}

function RecordPanel({
  title,
  record,
  entityType,
}: {
  title: string;
  record: Record<string, unknown> | null;
  entityType: string;
}) {
  if (!record) return (
    <div className="dup-panel">
      <h4 className="dup-panel-title">{title}</h4>
      <p style={{ color: '#888', fontSize: '0.875rem' }}>Record not found.</p>
    </div>
  );

  const fields =
    entityType === 'Supplier'
      ? ['name', 'contactName', 'email', 'phone', 'address', 'paymentTerms', 'isActive', 'fingerprint']
      : ['title', 'slug', 'category', 'status', 'tags', 'fingerprint', 'updatedAt'];

  return (
    <div className="dup-panel">
      <h4 className="dup-panel-title">{title}</h4>
      <dl className="dup-fields">
        {fields.map((f) => {
          const val = record[f];
          if (val === undefined) return null;
          const display =
            val === null ? '—'
            : Array.isArray(val) ? (val as string[]).join(', ') || '—'
            : String(val);
          return (
            <div key={f} className="dup-field-row">
              <dt className="dup-field-key">{f}</dt>
              <dd className="dup-field-val">{display}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
