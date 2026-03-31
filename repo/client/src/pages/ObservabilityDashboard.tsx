import { useState, useEffect, useCallback } from 'react';
import {
  fetchLogs,
  fetchJobs,
  fetchSystemStats,
  retryJob,
  SystemLog,
  JobMetric,
  SystemStats,
} from '../api/observability';

export function ObservabilityDashboard() {
  const [activeTab, setActiveTab] = useState<'logs' | 'jobs' | 'stats'>('logs');

  return (
    <div className="page">
      <h2>Observability</h2>
      <nav className="admin-tabs">
        <button
          className={`admin-tab${activeTab === 'logs' ? ' active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Trace Logs
        </button>
        <button
          className={`admin-tab${activeTab === 'jobs' ? ' active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Background Jobs
        </button>
        <button
          className={`admin-tab${activeTab === 'stats' ? ' active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          System Stats
        </button>
      </nav>

      {activeTab === 'logs' && <LogsPanel />}
      {activeTab === 'jobs' && <JobsPanel />}
      {activeTab === 'stats' && <StatsPanel />}
    </div>
  );
}

// ── Logs panel ───────────────────────────────────────────────────────────────

function LogsPanel() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState('');
  const [service, setService] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLogs({ level: level || undefined, service: service || undefined, page, limit: 50 });
      setLogs(res.data);
      setTotal(res.meta.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [level, service, page]);

  useEffect(() => { void load(); }, [load]);

  const levelBadge = (l: string) => {
    const cls =
      l === 'ERROR' ? 'obs-badge-error'
      : l === 'WARN' ? 'obs-badge-warn'
      : l === 'DEBUG' ? 'obs-badge-debug'
      : 'obs-badge-info';
    return <span className={`obs-badge ${cls}`}>{l}</span>;
  };

  return (
    <div className="obs-panel">
      <div className="obs-filters">
        <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
          <option value="">All levels</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
        <input
          type="text"
          placeholder="Service (e.g. HTTP)"
          value={service}
          onChange={(e) => { setService(e.target.value); setPage(1); }}
        />
        <button className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Service</th>
              <th>Message</th>
              <th>Method</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="obs-empty">Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={7} className="obs-empty">No logs found.</td></tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className={log.level === 'ERROR' ? 'obs-row-error' : log.level === 'WARN' ? 'obs-row-warn' : ''}>
                <td className="obs-td-mono">{new Date(log.createdAt).toLocaleTimeString()}</td>
                <td>{levelBadge(log.level)}</td>
                <td>{log.service ?? '—'}</td>
                <td className="obs-td-message">{log.message}</td>
                <td>{log.method ?? '—'}</td>
                <td>{log.statusCode ?? '—'}</td>
                <td>{log.durationMs != null ? `${log.durationMs}ms` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="obs-pagination">
        <button
          className="btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          ← Prev
        </button>
        <span>Page {page} · {total} entries</span>
        <button
          className="btn-secondary btn-sm"
          disabled={logs.length < 50}
          onClick={() => setPage((p) => p + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── Jobs panel ───────────────────────────────────────────────────────────────

function JobsPanel() {
  const [jobs, setJobs] = useState<JobMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJobs();
      setJobs(res.jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRetry = async (runId: string) => {
    setRetrying(runId);
    try {
      await retryJob(runId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  const statusBadge = (status: string) => {
    const cls =
      status === 'SUCCESS' ? 'obs-badge-info'
      : status === 'FAILED' ? 'obs-badge-error'
      : 'obs-badge-warn';
    return <span className={`obs-badge ${cls}`}>{status}</span>;
  };

  return (
    <div className="obs-panel">
      <div className="obs-filters">
        <button className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>Last Run</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Successes</th>
              <th>Failures</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="obs-empty">Loading…</td></tr>}
            {!loading && jobs.map((job) => (
              <tr key={job.jobName}>
                <td className="obs-td-mono">{job.jobName}</td>
                <td>{job.schedule}</td>
                <td>{job.lastRun ? new Date(job.lastRun.startedAt).toLocaleString() : '—'}</td>
                <td>{job.lastRun?.durationMs != null ? `${job.lastRun.durationMs}ms` : '—'}</td>
                <td>{job.lastRun ? statusBadge(job.lastRun.status) : '—'}</td>
                <td>{job.lastRun?.attempt ?? '—'}</td>
                <td>{job.successCount}</td>
                <td>{job.failureCount}</td>
                <td>
                  {job.lastRun?.status === 'FAILED' && (
                    <button
                      className="btn-secondary btn-sm"
                      disabled={retrying === job.lastRun.id}
                      onClick={() => void handleRetry(job.lastRun!.id)}
                    >
                      {retrying === job.lastRun.id ? 'Retrying…' : 'Retry'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stats panel ──────────────────────────────────────────────────────────────

function StatsPanel() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchSystemStats());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  if (loading) return <div className="obs-panel"><p>Loading…</p></div>;
  if (error) return <div className="obs-panel"><div className="error-banner">{error}</div></div>;
  if (!stats) return null;

  return (
    <div className="obs-panel">
      <button className="btn-secondary btn-sm" onClick={() => void load()} style={{ marginBottom: 16 }}>
        Refresh
      </button>

      <div className="dq-summary-grid" style={{ marginBottom: 24 }}>
        <div className="dq-card">
          <div className="dq-card-value">{stats.dbConnections.active}</div>
          <div className="dq-card-label">Active DB Connections</div>
        </div>
        <div className="dq-card">
          <div className="dq-card-value">{stats.dbConnections.idle}</div>
          <div className="dq-card-label">Idle DB Connections</div>
        </div>
        <div className="dq-card">
          <div className="dq-card-value">{stats.queues.pendingNotifications}</div>
          <div className="dq-card-label">Queued Notifications</div>
        </div>
        <div className="dq-card">
          <div className="dq-card-value">{stats.queues.pendingDuplicateCandidates}</div>
          <div className="dq-card-label">Pending Duplicates</div>
        </div>
        <div className="dq-card">
          <div className="dq-card-value">{formatUptime(stats.uptimeSeconds)}</div>
          <div className="dq-card-label">DB Uptime</div>
        </div>
      </div>

      <h4 style={{ marginBottom: 8 }}>Table Sizes</h4>
      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {stats.tableSizes.map((t) => (
              <tr key={t.table}>
                <td className="obs-td-mono">{t.table}</td>
                <td>{t.prettySize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
