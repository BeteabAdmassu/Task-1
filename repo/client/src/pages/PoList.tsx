import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPos, PaginatedPos } from '../api/purchase-orders';
import { fetchSupplierDropdown, SupplierDropdownItem } from '../api/suppliers';
import { PO_STATUSES, getPoStatusLabel, getPoStatusClass } from '../utils/po-status';

export function PoList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedPos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierDropdownItem[]>([]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchSupplierDropdown().then(setSuppliers).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20', sortBy, sortOrder };
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setData(await fetchPos(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, supplierFilter, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder((p) => (p === 'ASC' ? 'DESC' : 'ASC'));
    else { setSortBy(field); setSortOrder('ASC'); }
    setPage(1);
  };
  const si = (f: string) => sortBy !== f ? '' : sortOrder === 'ASC' ? ' ^' : ' v';

  return (
    <div className="page">
      <h1>Purchase Orders</h1>

      <div className="filters-row">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="filter-select">
          <option value="">All Status</option>
          {PO_STATUSES.map((s) => <option key={s} value={s}>{getPoStatusLabel(s)}</option>)}
        </select>
        <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }} className="filter-select">
          <option value="">All Suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="filter-input" style={{ minWidth: 140 }} />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="filter-input" style={{ minWidth: 140 }} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('poNumber')} className="sortable">PO #{si('poNumber')}</th>
              <th>Linked Request</th>
              <th>Supplier</th>
              <th onClick={() => handleSort('totalAmount')} className="sortable">Total{si('totalAmount')}</th>
              <th onClick={() => handleSort('status')} className="sortable">Status{si('status')}</th>
              <th onClick={() => handleSort('issuedAt')} className="sortable">Issued{si('issuedAt')}</th>
              <th onClick={() => handleSort('createdAt')} className="sortable">Created{si('createdAt')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="table-empty">Loading...</td></tr>}
            {!loading && data?.data.length === 0 && <tr><td colSpan={8} className="table-empty">No purchase orders found.</td></tr>}
            {!loading && data?.data.map((po) => (
              <tr key={po.id}>
                <td><strong>{po.poNumber}</strong></td>
                <td>{po.request?.requestNumber || '—'}</td>
                <td>{po.supplier?.name || '—'}</td>
                <td>${Number(po.totalAmount).toFixed(2)}</td>
                <td><span className={`status-badge ${getPoStatusClass(po.status)}`}>{getPoStatusLabel(po.status)}</span></td>
                <td>{po.issuedAt ? new Date(po.issuedAt).toLocaleDateString() : '—'}</td>
                <td>{new Date(po.createdAt).toLocaleDateString()}</td>
                <td><button className="btn-text" onClick={() => navigate(`/procurement/purchase-orders/${po.id}`)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-text">Previous</button>
          <span>Page {data.meta.page} of {data.meta.totalPages}</span>
          <button disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} className="btn-text">Next</button>
        </div>
      )}
    </div>
  );
}
