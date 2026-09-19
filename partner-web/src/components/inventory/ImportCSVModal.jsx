'use client';

// ────────────────────────────────────────────────────────────
// ImportCSVModal — P1-D
//
// Full drag-and-drop CSV import modal for the inventory page.
// Features:
//   • Drag-and-drop OR click-to-browse file picker
//   • "Download Template" link (hits GET /bulk-template)
//   • Upload progress state (idle → uploading → results)
//   • Results summary: "45 added, 12 updated, 3 errors"
//   • Error table: row number + message + data preview
//   • "Download Error Report" CSV export
// ────────────────────────────────────────────────────────────
import { useState, useRef, useCallback } from 'react';
import { inventoryApi } from '../../lib/api';

export default function ImportCSVModal({ onClose, onSuccess }) {
  const [phase,       setPhase]       = useState('idle');   // idle | uploading | done | error
  const [dragOver,    setDragOver]    = useState(false);
  const [selectedFile,setSelectedFile]= useState(null);
  const [results,     setResults]     = useState(null);     // { created, updated, errors[], message }
  const [topError,    setTopError]    = useState('');       // whole-file level error
  const fileInputRef = useRef(null);

  // ── File selection ──────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setTopError('Only .csv files are accepted');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setTopError('File is too large (max 5 MB)');
      return;
    }
    setTopError('');
    setSelectedFile(file);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  // ── Upload ──────────────────────────────────────────────────
  async function handleUpload() {
    if (!selectedFile) return;
    setPhase('uploading');
    setTopError('');
    try {
      const res = await inventoryApi.bulkUpload(selectedFile);
      setResults(res.data || res);
      setPhase('done');
      if ((res.data?.created || 0) > 0 || (res.data?.updated || 0) > 0) {
        onSuccess?.();
      }
    } catch (err) {
      setTopError(err.message || 'Upload failed');
      setPhase('error');
    }
  }

  function reset() {
    setPhase('idle');
    setSelectedFile(null);
    setResults(null);
    setTopError('');
  }

  // ── Error CSV download ──────────────────────────────────────
  function downloadErrorReport() {
    if (!results?.errors?.length) return;
    const header = 'row,error_message,product_name,price_inr,stock_quantity\n';
    const rows = results.errors.map(e =>
      `${e.row},"${e.message.replace(/"/g, '""')}","${e.data?.product_name || ''}",${e.data?.price_inr || ''},${e.data?.stock_quantity || ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 620,
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        maxHeight: '90vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 0',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
              📥 Import Inventory via CSV
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' }}>
              Upload up to 500 products at once. Existing products will be updated.
            </p>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>

          {/* Template download row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--surface-2)', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20,
            border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 20 }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                First time? Download the template
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                Fill in your products then re-upload the file
              </div>
            </div>
            <a
              href={inventoryApi.downloadTemplate()}
              download="tezznirmaan_inventory_template.csv"
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--primary)', color: '#fff', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              ⬇ Download Template
            </a>
          </div>

          {/* ── Idle / Upload Phase ── */}
          {(phase === 'idle' || phase === 'error') && (
            <>
              {/* Drag-and-drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--primary)' : selectedFile ? '#16a34a' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: '32px 20px',
                  textAlign: 'center',
                  background: dragOver
                    ? 'rgba(232,116,12,0.05)'
                    : selectedFile ? 'rgba(22,163,74,0.05)' : 'var(--surface-2)',
                  cursor: selectedFile ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                  marginBottom: 16,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files?.[0])}
                />
                {selectedFile ? (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                    <div style={{ fontWeight: 700, color: '#16a34a', fontSize: 15 }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setTopError(''); }}
                      style={{ ...linkBtn, marginTop: 8 }}
                    >
                      Choose a different file
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🗂️</div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 15, marginBottom: 4 }}>
                      Drag & drop your CSV here
                    </div>
                    <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
                      or <span style={{ color: 'var(--primary)', fontWeight: 600 }}>click to browse</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                      Max 5 MB · Max 500 rows · .csv only
                    </div>
                  </>
                )}
              </div>

              {/* Error banner */}
              {topError && (
                <div style={errorBanner}>⚠️ {topError}</div>
              )}

              {/* CSV format hint */}
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.6 }}>
                <strong>Required columns:</strong> product_name, unit, price_inr, stock_quantity, delivery_tier
                <br />
                <strong>Optional:</strong> brand, category, unit_size, mrp_inr, low_stock_threshold, description
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={outlineBtn}>Cancel</button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile}
                  style={{ ...primaryBtn, opacity: !selectedFile ? 0.5 : 1, cursor: !selectedFile ? 'not-allowed' : 'pointer' }}
                >
                  Upload & Import
                </button>
              </div>
            </>
          )}

          {/* ── Uploading phase ── */}
          {phase === 'uploading' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Processing your file…</div>
              <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>
                Creating products and updating inventory. This may take a moment.
              </div>
              <div style={progressBar}>
                <div style={progressFill} />
              </div>
            </div>
          )}

          {/* ── Done phase ── */}
          {phase === 'done' && results && (
            <>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard label="Products Added"  value={results.created} color="#16a34a" />
                <StatCard label="Products Updated" value={results.updated} color="#0284c7" />
                <StatCard label="Rows Skipped"     value={results.errors?.length || 0} color={results.errors?.length ? '#dc2626' : '#6b7280'} />
              </div>

              {/* Error table */}
              {results.errors?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', margin: 0 }}>
                      ⚠️ {results.errors.length} row{results.errors.length !== 1 ? 's' : ''} had errors
                    </h3>
                    <button onClick={downloadErrorReport} style={outlineBtn}>
                      ⬇ Download Error Report
                    </button>
                  </div>
                  <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-2)' }}>
                          {['Row', 'Product', 'Error'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                              fontSize: 11, color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.errors.slice(0, 50).map((err, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#dc2626' }}>
                              #{err.row}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {err.data?.product_name || '—'}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>
                              {err.message}
                            </td>
                          </tr>
                        ))}
                        {results.errors.length > 50 && (
                          <tr>
                            <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-2)', fontStyle: 'italic' }}>
                              …and {results.errors.length - 50} more. Download the error report for the full list.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={reset} style={outlineBtn}>Import Another File</button>
                <button onClick={onClose} style={primaryBtn}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer-progress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface-2)', borderRadius: 10, padding: '16px',
      border: `1px solid ${color}30`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const closeBtn = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
  fontSize: 14, color: 'var(--text-2)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};
const primaryBtn = {
  padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
};
const outlineBtn = {
  padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
  background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--border)', cursor: 'pointer',
};
const linkBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: 0,
};
const errorBanner = {
  background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)',
  color: '#dc2626', borderRadius: 8, padding: '10px 14px',
  fontSize: 13, marginBottom: 16,
};
const progressBar = {
  height: 4, borderRadius: 2, background: 'var(--border)',
  overflow: 'hidden', marginTop: 20, maxWidth: 280, margin: '20px auto 0',
};
const progressFill = {
  height: '100%', width: '40%', borderRadius: 2,
  background: 'var(--primary)',
  animation: 'shimmer-progress 1.4s ease-in-out infinite',
};
