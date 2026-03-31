import { useState, useEffect, useCallback } from 'react';
import {
  fetchSynonyms,
  createSynonym,
  updateSynonym,
  deleteSynonym,
  SynonymRecord,
} from '../api/search';

export function SynonymManager() {
  const [synonyms, setSynonyms] = useState<SynonymRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSynonyms(await fetchSynonyms());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this synonym group?')) return;
    try {
      await deleteSynonym(id);
      setSynonyms((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Synonym Manager</h2>
        <button className="btn-primary btn-sm" onClick={() => { setShowNew(true); setEditingId(null); }}>
          Add Synonym Group
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showNew && (
        <SynonymForm
          onSave={async (term, syns) => {
            const created = await createSynonym({ term, synonyms: syns });
            setSynonyms((prev) => [...prev, created].sort((a, b) => a.term.localeCompare(b.term)));
            setShowNew(false);
          }}
          onCancel={() => setShowNew(false)}
        />
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Term</th>
              <th>Synonyms</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="table-empty">Loading…</td></tr>}
            {!loading && synonyms.length === 0 && (
              <tr><td colSpan={4} className="table-empty">No synonym groups defined.</td></tr>
            )}
            {!loading && synonyms.map((s) =>
              editingId === s.id ? (
                <tr key={s.id}>
                  <td colSpan={4}>
                    <SynonymForm
                      initial={{ term: s.term, synonyms: s.synonyms }}
                      onSave={async (term, syns) => {
                        const updated = await updateSynonym(s.id, { term, synonyms: syns });
                        setSynonyms((prev) =>
                          prev.map((x) => (x.id === s.id ? updated : x)),
                        );
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td><strong>{s.term}</strong></td>
                  <td>
                    <div className="article-tags">
                      {s.synonyms.map((syn) => (
                        <span key={syn} className="article-tag">{syn}</span>
                      ))}
                    </div>
                  </td>
                  <td>{new Date(s.updatedAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn-text"
                      onClick={() => { setEditingId(s.id); setShowNew(false); }}
                    >
                      Edit
                    </button>
                    <button className="btn-text btn-danger-text" onClick={() => handleDelete(s.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SynonymForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { term: string; synonyms: string[] };
  onSave: (term: string, synonyms: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [term, setTerm] = useState(initial?.term ?? '');
  const [synInput, setSynInput] = useState(initial?.synonyms.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const syns = synInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!term.trim() || syns.length === 0) {
      setError('Term and at least one synonym are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(term.trim().toLowerCase(), syns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="synonym-form">
      {error && <div className="error-banner" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="synonym-form-fields">
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Term</label>
          <input
            className="form-input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="e.g. aphids"
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Synonyms (comma-separated)</label>
          <input
            className="form-input"
            value={synInput}
            onChange={(e) => setSynInput(e.target.value)}
            placeholder="e.g. plant lice, greenfly"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <button className="btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
