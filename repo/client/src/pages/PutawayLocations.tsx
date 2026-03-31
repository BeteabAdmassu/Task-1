import { useState, useEffect, FormEvent } from 'react';
import {
  fetchAdminPutawayLocations,
  createPutawayLocation,
  updatePutawayLocation,
  deletePutawayLocation,
  PutawayLocationRecord,
} from '../api/receiving';

interface FormState {
  code: string;
  description: string;
  zone: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { code: '', description: '', zone: '', isActive: true };

export function PutawayLocations() {
  const [locations, setLocations] = useState<PutawayLocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setLocations(await fetchAdminPutawayLocations());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  };

  const openEdit = (loc: PutawayLocationRecord) => {
    setEditId(loc.id);
    setForm({
      code: loc.code,
      description: loc.description || '',
      zone: loc.zone || '',
      isActive: loc.isActive,
    });
    setShowForm(true);
    setError(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code,
        description: form.description || undefined,
        zone: form.zone || undefined,
        isActive: form.isActive,
      };
      if (editId) {
        await updatePutawayLocation(editId, payload);
      } else {
        await createPutawayLocation(payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete location "${code}"?`)) return;
    try {
      await deletePutawayLocation(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Putaway Locations</h1>
        <button className="btn-primary" onClick={openCreate}>Add Location</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <div className="detail-form" style={{ marginBottom: 24 }}>
          <h3>{editId ? 'Edit Location' : 'New Location'}</h3>
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-group">
                <label>Code *</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. A-01-03"
                  maxLength={20}
                  required
                />
              </div>
              <div className="form-group">
                <label>Zone</label>
                <input
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  placeholder="e.g. Cold Storage"
                  maxLength={50}
                />
              </div>
              <div className="form-group form-group-full">
                <label>Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  maxLength={200}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    style={{ marginRight: 6 }}
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Zone</th>
              <th>Description</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="table-empty">Loading...</td></tr>}
            {!loading && locations.length === 0 && (
              <tr><td colSpan={5} className="table-empty">No locations defined.</td></tr>
            )}
            {!loading && locations.map((loc) => (
              <tr key={loc.id}>
                <td><strong>{loc.code}</strong></td>
                <td>{loc.zone || '—'}</td>
                <td>{loc.description || '—'}</td>
                <td>
                  <span className={`status-badge ${loc.isActive ? 'status-approved' : 'status-cancelled'}`}>
                    {loc.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className="btn-text" onClick={() => openEdit(loc)}>Edit</button>
                  {' '}
                  <button className="btn-text" style={{ color: '#c62828' }} onClick={() => handleDelete(loc.id, loc.code)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
