import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchSupplier,
  createSupplier,
  updateSupplier,
  SupplierRecord,
} from '../api/suppliers';
import { useAuth } from '../contexts/AuthContext';
import { PAYMENT_TERMS, getPaymentTermsLabel } from '../utils/payment-terms';

const emptySupplier = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  paymentTerms: 'NET_30',
  customTermsDescription: '',
  bankingNotes: '',
  internalRiskFlag: '',
  isActive: true,
};

export function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === 'new';
  const isAdmin = user?.role === 'ADMINISTRATOR';

  const [form, setForm] = useState<Record<string, string | boolean>>(emptySupplier);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && id) {
      setLoading(true);
      fetchSupplier(id)
        .then((s) => {
          setForm({
            name: s.name,
            contactName: s.contactName || '',
            email: s.email || '',
            phone: s.phone || '',
            address: s.address || '',
            paymentTerms: s.paymentTerms,
            customTermsDescription: s.customTermsDescription || '',
            bankingNotes: s.bankingNotes || '',
            internalRiskFlag: s.internalRiskFlag || '',
            isActive: s.isActive,
          });
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: Partial<SupplierRecord> = {
      name: form.name as string,
      contactName: (form.contactName as string) || null,
      email: (form.email as string) || null,
      phone: (form.phone as string) || null,
      address: (form.address as string) || null,
      paymentTerms: form.paymentTerms as string,
      customTermsDescription: (form.customTermsDescription as string) || null,
      isActive: form.isActive as boolean,
    };

    if (isAdmin) {
      payload.bankingNotes = (form.bankingNotes as string) || null;
      payload.internalRiskFlag = (form.internalRiskFlag as string) || null;
    }

    try {
      if (isNew) {
        const created = await createSupplier(payload);
        navigate(`/procurement/suppliers/${created.id}`, { replace: true });
      } else {
        await updateSupplier(id!, payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isNew ? 'New Supplier' : `Edit Supplier`}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isNew && (
            <button
              className="btn-secondary"
              onClick={() => navigate(`/procurement/suppliers/${id}/ledger`)}
            >
              View Ledger
            </button>
          )}
          <button className="btn-secondary" onClick={() => navigate('/procurement/suppliers')}>
            Back to List
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form className="detail-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={form.name as string}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              maxLength={200}
            />
          </div>

          <div className="form-group">
            <label>Contact Name</label>
            <input
              type="text"
              value={form.contactName as string}
              onChange={(e) => handleChange('contactName', e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email as string}
              onChange={(e) => handleChange('email', e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input
              type="text"
              value={form.phone as string}
              onChange={(e) => handleChange('phone', e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="form-group form-group-full">
            <label>Address</label>
            <textarea
              value={form.address as string}
              onChange={(e) => handleChange('address', e.target.value)}
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>Payment Terms</label>
            <select
              value={form.paymentTerms as string}
              onChange={(e) => handleChange('paymentTerms', e.target.value)}
            >
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t}>{getPaymentTermsLabel(t)}</option>
              ))}
            </select>
          </div>

          {form.paymentTerms === 'CUSTOM' && (
            <div className="form-group">
              <label>Custom Terms Description</label>
              <input
                type="text"
                value={form.customTermsDescription as string}
                onChange={(e) => handleChange('customTermsDescription', e.target.value)}
              />
            </div>
          )}

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={form.isActive as boolean}
                onChange={(e) => handleChange('isActive', e.target.checked)}
              />
              Active
            </label>
          </div>
        </div>

        {isAdmin && (
          <div className="sensitive-section">
            <h3>Sensitive Information (Admin Only)</h3>
            <div className="form-grid">
              <div className="form-group form-group-full">
                <label>Banking Notes</label>
                <textarea
                  value={form.bankingNotes as string}
                  onChange={(e) => handleChange('bankingNotes', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="form-group form-group-full">
                <label>Internal Risk Flag</label>
                <textarea
                  value={form.internalRiskFlag as string}
                  onChange={(e) => handleChange('internalRiskFlag', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary btn-sm" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create Supplier' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
