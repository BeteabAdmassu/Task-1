import { useState, useEffect } from 'react';
import { fetchSupplierPortalProfile, SupplierRecord } from '../api/suppliers';
import { getPaymentTermsLabel } from '../utils/payment-terms';
import { SupplierPortalPoList } from './SupplierPortalPoList';
import { SupplierPortalReturns } from './SupplierPortalReturns';

export function SupplierPortal() {
  const [profile, setProfile] = useState<SupplierRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSupplierPortalProfile()
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><p>Loading...</p></div>;

  if (error) {
    return (
      <div className="page">
        <h1>Supplier Portal</h1>
        <div className="error-banner">{error}</div>
        <p>Your account may not be linked to a supplier profile yet. Please contact an administrator.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Supplier Portal</h1>

      {profile && (
        <div className="portal-layout">
          <div className="portal-card">
            <h2>Company Profile</h2>
            <dl className="detail-list">
              <dt>Name</dt>
              <dd>{profile.name}</dd>
              <dt>Contact</dt>
              <dd>{profile.contactName || '—'}</dd>
              <dt>Email</dt>
              <dd>{profile.email || '—'}</dd>
              <dt>Phone</dt>
              <dd>{profile.phone || '—'}</dd>
              <dt>Address</dt>
              <dd>{profile.address || '—'}</dd>
              <dt>Payment Terms</dt>
              <dd>{getPaymentTermsLabel(profile.paymentTerms)}</dd>
              {profile.customTermsDescription && (
                <>
                  <dt>Custom Terms</dt>
                  <dd>{profile.customTermsDescription}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="portal-card">
            <SupplierPortalPoList />
          </div>

          <div className="portal-card">
            <SupplierPortalReturns />
          </div>
        </div>
      )}
    </div>
  );
}
