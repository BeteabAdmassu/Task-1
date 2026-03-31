import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSuppliers, PaginatedSuppliers } from '../api/suppliers';
import { getPaymentTermsLabel, PAYMENT_TERMS } from '../utils/payment-terms';

export function SupplierList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedSuppliers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [termsFilter, setTermsFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: '20',
        sortBy,
        sortOrder,
      };
      if (search) params.search = search;
      if (termsFilter) params.paymentTerms = termsFilter;
      if (activeFilter) params.isActive = activeFilter;
      setData(await fetchSuppliers(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [page, search, termsFilter, activeFilter, sortBy, sortOrder]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  const sortIndicator = (field: string) => {
    if (sortBy !== field) return '';
    return sortOrder === 'ASC' ? ' ^' : ' v';
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Suppliers</h1>
        <button className="btn-primary btn-sm" onClick={() => navigate('/procurement/suppliers/new')}>
          Add Supplier
        </button>
      </div>

      <div className="filters-row">
        <input
          type="text"
          placeholder="Search name or contact..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="filter-input"
        />
        <select
          value={termsFilter}
          onChange={(e) => { setTermsFilter(e.target.value); setPage(1); }}
          className="filter-select"
        >
          <option value="">All Payment Terms</option>
          {PAYMENT_TERMS.map((t) => (
            <option key={t} value={t}>{getPaymentTermsLabel(t)}</option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
          className="filter-select"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} className="sortable">
                Name{sortIndicator('name')}
              </th>
              <th>Contact</th>
              <th>Email</th>
              <th onClick={() => handleSort('paymentTerms')} className="sortable">
                Payment Terms{sortIndicator('paymentTerms')}
              </th>
              <th onClick={() => handleSort('isActive')} className="sortable">
                Status{sortIndicator('isActive')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="table-empty">Loading...</td></tr>
            )}
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={6} className="table-empty">No suppliers found.</td></tr>
            )}
            {!loading && data?.data.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.contactName || '—'}</td>
                <td>{s.email || '—'}</td>
                <td>{getPaymentTermsLabel(s.paymentTerms)}</td>
                <td>
                  <span className={`status-badge ${s.isActive ? 'active' : 'inactive'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button
                    className="btn-text"
                    onClick={() => navigate(`/procurement/suppliers/${s.id}`)}
                  >
                    View / Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-text">
            Previous
          </button>
          <span>Page {data.meta.page} of {data.meta.totalPages}</span>
          <button disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} className="btn-text">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
