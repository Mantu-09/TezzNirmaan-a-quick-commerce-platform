'use client';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../../../lib/api';

// ── Queue colour coding ───────────────────────────────────────
const QUEUE_LABELS = {
  'send-notification':     '🔔 Notifications',
  'send-sms':              '📱 SMS',
  'refresh-ratings':       '⭐ Ratings',
  'expire-wallet-credits': '💰 Wallet Expiry',
  'process-referral-reward': '🎁 Referrals',
  'process-cashback-reward': '💸 Cashback',
  'weekly-settlements':    '🏦 Settlements',
  'expire-referral-events':'⏰ Referral Events',
  'prune-rider-locations': '📍 Rider Locations',
  'expire-subscriptions':  '🎫 TezzPass',
  'check-failed-jobs':     '🔍 DLQ Monitor',
  'low-stock-alert':       '📦 Low Stock',
};

function queueDot(count) {
  if (count === 0) return { color: '#22c55e', pulse: false, label: 'Healthy' };
  if (count <= 5)  return { color: '#f59e0b', pulse: false, label: `${count} failed` };
  return              { color: '#ef4444', pulse: true,  label: `${count} failed` };
}

// ── Time ago formatter ────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Pulsing red dot animation ─────────────────────────────────
const pulseStyle = `
@keyframes dlq-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.4); }
}
`;

// ── Queue Summary Bar ─────────────────────────────────────────
function QueueSummaryBar({ queueCounts, selectedQueue, onSelect }) {
  const counts = Object.fromEntries(
    (queueCounts || []).map(r => [r.queue_name, Number(r.failed_count)])
  );

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 'var(--s5)',
    }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          border: '1.5px solid',
          borderColor: !selectedQueue ? 'var(--primary)' : 'var(--border)',
          background:  !selectedQueue ? 'rgba(232,116,12,0.1)' : 'var(--surface-2)',
          color: !selectedQueue ? 'var(--primary)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        All Queues
      </button>

      {Object.entries(QUEUE_LABELS).map(([name, label]) => {
        const n   = counts[name] || 0;
        const dot = queueDot(n);
        const sel = selectedQueue === name;
        return (
          <button
            key={name}
            onClick={() => onSelect(sel ? null : name)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: '1.5px solid',
              borderColor: sel ? 'var(--primary)' : 'var(--border)',
              background:  sel ? 'rgba(232,116,12,0.1)' : 'var(--surface-2)',
              color: sel ? 'var(--primary)' : 'var(--text)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: dot.color, flexShrink: 0,
              animation: dot.pulse ? 'dlq-pulse 1.2s ease-in-out infinite' : 'none',
            }} />
            {label.split(' ').slice(1).join(' ')}
            {n > 0 && (
              <span style={{
                background: dot.color, color: '#fff',
                borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700,
              }}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Job Row ───────────────────────────────────────────────────
function JobRow({ job, onRetry, onDiscard, retrying, discarding }) {
  const [expanded, setExpanded] = useState(false);
  const label = QUEUE_LABELS[job.name] || job.name;

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', transition: 'background 0.1s' }}
        className="job-row"
      >
        <td style={{ padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: 2 }}>
            {job.id?.slice(0, 8)}…
          </div>
        </td>
        <td style={{ padding: '12px 16px', maxWidth: 320 }}>
          <div style={{
            fontSize: 12, color: '#ef4444',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 300,
          }}>
            {job.error_message || '(no error message)'}
          </div>
        </td>
        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {timeAgo(job.failed_at)}
          <div style={{ fontSize: 10 }}>retries: {job.retry_count ?? 0}</div>
        </td>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={e => { e.stopPropagation(); onRetry(job.id); }}
              disabled={retrying}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'var(--primary)', color: '#fff', border: 'none',
                cursor: retrying ? 'not-allowed' : 'pointer', opacity: retrying ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              {retrying ? '…' : '↩ Retry'}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDiscard(job.id); }}
              disabled={discarding}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                cursor: discarding ? 'not-allowed' : 'pointer', opacity: discarding ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              ✕
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} style={{ padding: '0 16px 16px', background: 'var(--surface-2)' }}>
            <pre style={{
              fontSize: 11, fontFamily: 'monospace', margin: 0,
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              background: 'var(--surface)', padding: 12, borderRadius: 8,
              border: '1px solid var(--border)',
              maxHeight: 200, overflowY: 'auto',
            }}>
              {JSON.stringify(job.data, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function JobsPage() {
  const qc             = useQueryClient();
  const [queue, setQueue]   = useState(null);
  const [page,  setPage]    = useState(1);
  const [toast, setToast]   = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-jobs', queue, page],
    queryFn:  () => jobsApi.getFailedJobs({ queue: queue || undefined, page, limit: 20 }),
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  const jobs        = data?.data?.jobs        || [];
  const queueCounts = data?.data?.queueCounts || [];
  const totalFailed = data?.data?.totalFailed || 0;
  const hasMore     = data?.data?.hasMore     || false;

  const retryMut = useMutation({
    mutationFn: (jobId) => jobsApi.retryJob(jobId),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['admin-jobs'] }); showToast('✓ Job queued for retry'); },
    onError:    (e) => showToast('⚠ ' + (e.message || 'Retry failed')),
  });

  const discardMut = useMutation({
    mutationFn: (jobId) => jobsApi.discardJob(jobId),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['admin-jobs'] }); showToast('✓ Job discarded'); },
    onError:    (e) => showToast('⚠ ' + (e.message || 'Discard failed')),
  });

  const retryAllMut = useMutation({
    mutationFn: (q) => jobsApi.retryAll(q),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['admin-jobs'] });
      showToast(`✓ ${res?.data?.retriedCount || 0} job(s) queued for retry`);
    },
    onError: (e) => showToast('⚠ ' + (e.message || 'Retry-all failed')),
  });

  const handleQueueSelect = useCallback((q) => {
    setQueue(q);
    setPage(1);
  }, []);

  return (
    <div className="page-body">
      <style>{pulseStyle}</style>
      <style>{`.job-row:hover { background: var(--surface-2); }`}</style>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast${toast.startsWith('✓') ? ' success' : toast.startsWith('⚠') ? ' error' : ''}`}>
            {toast}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--s5)', flexWrap: 'wrap', gap: 'var(--s3)' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            Background Jobs Monitor
            {totalFailed > 0 && (
              <span style={{
                background: '#ef4444', color: '#fff',
                fontSize: 12, fontWeight: 700,
                padding: '2px 10px', borderRadius: 12,
                animation: 'dlq-pulse 1.5s ease-in-out infinite',
              }}>
                {totalFailed} failed
              </span>
            )}
            {totalFailed === 0 && !isLoading && (
              <span style={{
                background: 'rgba(34,197,94,0.15)', color: '#16a34a',
                fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
                border: '1px solid rgba(34,197,94,0.3)',
              }}>
                ✅ All queues healthy
              </span>
            )}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
            Click a row to inspect job payload. Auto-refreshes every 30s.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--s3)' }}>
          {queue && (
            <button
              className="btn btn-outline"
              onClick={() => retryAllMut.mutate(queue)}
              disabled={retryAllMut.isPending || jobs.length === 0}
              style={{ fontSize: 13 }}
            >
              {retryAllMut.isPending ? '…' : `↩ Retry All in ${queue.split('-').slice(0, 2).join('-')}`}
            </button>
          )}
          <button
            className="btn btn-outline"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ fontSize: 13 }}
          >
            {isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Queue filter chips */}
      <QueueSummaryBar
        queueCounts={queueCounts}
        selectedQueue={queue}
        onSelect={handleQueueSelect}
      />

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 'var(--s8)', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading jobs…
          </div>
        ) : jobs.length === 0 ? (
          <div style={{
            padding: 'var(--s8)', textAlign: 'center',
            color: 'var(--text-secondary)', fontSize: 14,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 600 }}>
              {queue ? `No failed jobs in "${QUEUE_LABELS[queue] || queue}"` : 'All queues healthy — no failed jobs'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Jobs may still be retrying or archived.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Queue</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Error</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Failed</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody style={{ divide: 'var(--border)' }}>
              {jobs.map(job => (
                <JobRow
                  key={job.id}
                  job={job}
                  onRetry={(id) => retryMut.mutate(id)}
                  onDiscard={(id) => discardMut.mutate(id)}
                  retrying={retryMut.isPending && retryMut.variables === job.id}
                  discarding={discardMut.isPending && discardMut.variables === job.id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--s3)', marginTop: 'var(--s5)' }}>
          <button className="btn btn-outline" onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
          <span style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>Page {page}</span>
          <button className="btn btn-outline" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>Next →</button>
        </div>
      )}
    </div>
  );
}
