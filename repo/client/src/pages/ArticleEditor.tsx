import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchArticle,
  createArticle,
  updateArticle,
  promoteArticle,
  ArticleRecord,
} from '../api/knowledge-base';
import {
  getStatusLabel,
  getStatusClass,
  ARTICLE_CATEGORIES,
  getNextStatuses,
} from '../utils/article';

type EditorTab = 'write' | 'preview';

export function ArticleEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [changeSummary, setChangeSummary] = useState('');
  const [editorTab, setEditorTab] = useState<EditorTab>('write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const a = await fetchArticle(id);
      setArticle(a);
      setTitle(a.title);
      setCategory(a.category);
      setContent(a.content);
      setTags(a.tags);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { title, category, content, tags, changeSummary: changeSummary || undefined };
      if (isEdit && id) {
        const updated = await updateArticle(id, payload);
        navigate(`/plant-care/articles/${updated.id}`);
      } else {
        const created = await createArticle(payload);
        navigate(`/plant-care/articles/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePromote = async (status: string) => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await promoteArticle(id, status);
      setArticle(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <button className="btn-text" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
            &larr; Back
          </button>
          <h2>{isEdit ? 'Edit Article' : 'New Article'}</h2>
          {article && (
            <span className={`status-badge ${getStatusClass(article.status)}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {getStatusLabel(article.status)}
            </span>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="detail-form">
        <div className="form-group">
          <label className="form-label">Title</label>
          <input
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="Article title"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Category</label>
          <select
            className="form-input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {ARTICLE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Tags</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              className="form-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Add tag and press Enter"
              style={{ flex: 1 }}
            />
            <button className="btn-secondary btn-sm" type="button" onClick={addTag}>
              Add
            </button>
          </div>
          <div className="article-tags">
            {tags.map((tag) => (
              <span key={tag} className="article-tag">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="form-group">
          <div className="admin-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`admin-tab${editorTab === 'write' ? ' active' : ''}`}
              onClick={() => setEditorTab('write')}
            >
              Write
            </button>
            <button
              type="button"
              className={`admin-tab${editorTab === 'preview' ? ' active' : ''}`}
              onClick={() => setEditorTab('preview')}
            >
              Preview
            </button>
          </div>
          {editorTab === 'write' ? (
            <textarea
              className="form-input article-editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write article content (markdown supported)..."
            />
          ) : (
            <pre className="article-markdown article-preview">{content || 'Nothing to preview.'}</pre>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Change Summary {!isEdit && '(optional)'}</label>
          <input
            className="form-input"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder={isEdit ? 'Describe what changed' : 'Initial version'}
          />
        </div>

        <div className="form-actions">
          <button className="btn-secondary" onClick={() => navigate(-1)} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !title || !content}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Article'}
          </button>
        </div>
      </div>

      {isEdit && article && getNextStatuses(article.status).length > 0 && (
        <div className="detail-form" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Promote Article</h3>
          <p style={{ marginBottom: 12, fontSize: '0.875rem', color: '#666' }}>
            Current status: <strong>{getStatusLabel(article.status)}</strong>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {getNextStatuses(article.status).map((s) => (
              <button
                key={s.value}
                className={s.value === 'ARCHIVED' ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => handlePromote(s.value)}
                disabled={saving}
              >
                {s.value === 'ARCHIVED' ? 'Archive' : `Promote to ${s.label}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
