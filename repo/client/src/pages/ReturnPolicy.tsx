import { useState, useEffect, FormEvent } from 'react';
import { fetchReturnPolicy, updateReturnPolicy, ReturnPolicyRecord } from '../api/returns';

export function ReturnPolicy() {
  const [policy, setPolicy] = useState<ReturnPolicyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    returnWindowDays: '',
    restockingFeeDefault: '',
    restockingFeeAfterDaysThreshold: '',
    restockingFeeAfterDays: '',
  });

  useEffect(() => {
    fetchReturnPolicy()
      .then((p) => {
        setPolicy(p);
        setForm({
          returnWindowDays: String(p.returnWindowDays),
          restockingFeeDefault: String(p.restockingFeeDefault),
          restockingFeeAfterDaysThreshold: String(p.restockingFeeAfterDaysThreshold),
          restockingFeeAfterDays: String(p.restockingFeeAfterDays),
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateReturnPolicy({
        returnWindowDays: parseInt(form.returnWindowDays),
        restockingFeeDefault: parseFloat(form.restockingFeeDefault),
        restockingFeeAfterDaysThreshold: parseInt(form.restockingFeeAfterDaysThreshold),
        restockingFeeAfterDays: parseFloat(form.restockingFeeAfterDays),
      });
      setPolicy(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Return Policy</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="detail-form">
        <form onSubmit={handleSave}>
          <div className="form-grid">
            <div className="form-group">
              <label>Return Window (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={form.returnWindowDays}
                onChange={(e) => setForm({ ...form, returnWindowDays: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Default Restocking Fee (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.restockingFeeDefault}
                onChange={(e) => setForm({ ...form, restockingFeeDefault: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Late Return Threshold (days)</label>
              <input
                type="number"
                min="0"
                value={form.restockingFeeAfterDaysThreshold}
                onChange={(e) =>
                  setForm({ ...form, restockingFeeAfterDaysThreshold: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Late Return Restocking Fee (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.restockingFeeAfterDays}
                onChange={(e) => setForm({ ...form, restockingFeeAfterDays: e.target.value })}
                required
              />
            </div>
          </div>

          <p className="placeholder-text" style={{ marginTop: 8 }}>
            Damaged / Wrong Item returns always have 0% restocking fee regardless of timing.
          </p>

          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save Policy'}
            </button>
          </div>
        </form>

        {policy && (
          <p style={{ marginTop: 12, fontSize: '0.8rem', color: '#888' }}>
            Last updated: {new Date(policy.updatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
