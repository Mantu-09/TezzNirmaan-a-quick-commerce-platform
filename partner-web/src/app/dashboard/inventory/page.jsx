'use client';
import { useState, Suspense } from 'react'; // P4-2C: added Suspense
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../../lib/api';
import ImportCSVModal from '../../../components/inventory/ImportCSVModal'; // P1-D
import { TableSkeleton } from '../../../components/skeletons'; // P4-2C

// ── P7-5: Image Upload Field ────────────────────────────────
// Uploads directly to R2 via presigned PUT URL.
// Backend never receives the image bytes.
function ImageUploadField({ onUploadComplete, existingUrl }) {
  const [uploading,   setUploading]   = useState(false);
  const [previewUrl,  setPreviewUrl]  = useState(existingUrl || null);
  const [uploadError, setUploadError] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Basic client-side validation
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file (JPEG, PNG, WebP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10 MB limit
      setUploadError('Image must be under 10 MB');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // 1. Get presigned URL from backend
      const { upload_url, public_url } = await inventoryApi.getImageUploadUrl('products', file.type);

      // 2. PUT directly to R2 — never touches Node.js backend
      const res = await fetch(upload_url, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      });
      if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);

      // 3. Update preview and notify parent
      setPreviewUrl(public_url);
      onUploadComplete(public_url);
    } catch (err) {
      setUploadError(err.message || 'Upload failed — please retry');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ marginBottom: 'var(--s4)' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
        Product Image
        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>(optional)</span>
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
        {/* Preview thumbnail */}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Product preview"
            style={{
              width: 72, height: 72, objectFit: 'cover',
              borderRadius: 8, border: '1px solid var(--border)',
            }}
          />
        )}

        {/* Upload button */}
        <label style={{
          display:     'inline-flex',
          alignItems:  'center',
          gap:         6,
          padding:     '8px 16px',
          borderRadius: 8,
          border:      '1.5px dashed var(--border)',
          background:  uploading ? 'var(--surface-2)' : 'transparent',
          color:       'var(--text)',
          fontSize:    13,
          fontWeight:  600,
          cursor:      uploading ? 'not-allowed' : 'pointer',
          transition:  'all 0.15s',
        }}>
          {uploading ? '⏳ Uploading…' : previewUrl ? '🔄 Change Image' : '📷 Add Image'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {uploadError && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>{uploadError}</p>
      )}
    </div>
  );
}

// ── Inline editable cell ──────────────────────────────────────
function EditableCell({ value, onSave, type = 'number', prefix = '' }) {
  const [editing, setEditing]  = useState(false);
  const [draft,   setDraft]    = useState(value);

  const handleSave = () => {
    const parsed = type === 'number' ? Number(draft) : draft;
    if (parsed !== value) onSave(parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="cell-edit">
        {prefix && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{prefix}</span>}
        <input
          className="input inline"
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          style={{ width: type === 'text' ? 160 : 80 }}
        />
        <button className="confirm-btn" onClick={handleSave}>✓</button>
        <button className="cancel-btn"  onClick={() => { setDraft(value); setEditing(false); }}>✗</button>
      </div>
    );
  }

  return (
    <span
      className="editable-cell"
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {prefix}{type === 'number' && prefix === '₹' ? (value / 100).toFixed(0) : value}
      <span style={{ fontSize: 10, opacity: 0.5 }}>✏</span>
    </span>
  );
}

// ── Toggle chip ───────────────────────────────────────────────
function AvailableToggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        background:   value ? 'var(--success-light)' : 'var(--error-light)',
        color:        value ? 'var(--success)'       : 'var(--error)',
        border:       'none', borderRadius: 'var(--r-full)',
        padding:      '4px 14px', fontWeight: 600, fontSize: 12,
        cursor:       'pointer', whiteSpace: 'nowrap',
      }}
    >
      {value ? '✓ Available' : '✗ Out of Stock'}
    </button>
  );
}

// ── Add Item Modal ────────────────────────────────────────────
function AddItemModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    product_name: '', unit: 'bag', price: '', mrp: '', stock_quantity: '',
    delivery_tier: 'quick', primary_image_url: '', // P7-5
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card card-pad-lg" style={{ width: '100%', maxWidth: 500 }}>
        <h2 style={{ marginBottom: 'var(--s5)' }}>Add Item to Inventory</h2>

        <label>Product Name</label>
        <input className="input" value={form.product_name} onChange={e => set('product_name', e.target.value)} placeholder="e.g. Ultratech Cement 50kg" style={{ marginBottom: 'var(--s4)' }} />

        {/* P7-5: Image upload */}
        <ImageUploadField
          onUploadComplete={(url) => set('primary_image_url', url)}
          existingUrl={form.primary_image_url}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)', marginBottom: 'var(--s4)' }}>
          <div>
            <label>Unit</label>
            <select className="input" value={form.unit} onChange={e => set('unit', e.target.value)}>
              {['bag','kg','litre','box','piece','bundle','roll','sheet'].map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Delivery Type</label>
            <select className="input" value={form.delivery_tier} onChange={e => set('delivery_tier', e.target.value)}>
              <option value="quick">⚡ Quick (60-90 min)</option>
              <option value="scheduled">📅 Scheduled (next-day slot)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s3)', marginBottom: 'var(--s5)' }}>
          <div>
            <label>Sale Price (₹)</label>
            <input className="input" type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="e.g. 380" />
          </div>
          <div>
            <label>MRP (₹)</label>
            <input className="input" type="number" value={form.mrp} onChange={e => set('mrp', e.target.value)} placeholder="e.g. 420" />
          </div>
          <div>
            <label>In Stock (qty)</label>
            <input className="input" type="number" value={form.stock_quantity} onChange={e => set('stock_quantity', e.target.value)} placeholder="e.g. 50" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--s3)', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave({
              ...form,
              price:             Math.round(Number(form.price) * 100),
              mrp:               Math.round(Number(form.mrp)   * 100),
              stock_quantity:    Number(form.stock_quantity),
              primary_image_url: form.primary_image_url || undefined, // P7-5
            })}
            disabled={!form.product_name || !form.price}
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Inventory Page ───────────────────────────────────────
export default function InventoryPage() {
  const queryClient  = useQueryClient();
  const [search,     setSearch]     = useState('');
  const [showAdd,    setShowAdd]    = useState(false);
  const [showImport, setShowImport] = useState(false); // P1-D
  const [toast,      setToast]      = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false); // P5-5A

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', search],
    queryFn:  () => inventoryApi.getInventory({ search: search || undefined }),
    staleTime: 60 * 1000,
  });

  const allItems = data?.data?.inventory || [];
  // P5-5A: use per-item low_stock_threshold (DB default 5) instead of hardcoded value
  const lowStockItems = allItems.filter(i => i.stock_quantity <= (i.low_stock_threshold ?? 5) && i.stock_quantity >= 0);
  const items = showLowStockOnly ? lowStockItems : allItems;
  const lowStock = lowStockItems.length;

  const update = useMutation({
    mutationFn: ({ id, data }) => inventoryApi.updateItem(id, data),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      showToast('✓ Saved');
    },
    onError: () => showToast('⚠ Save failed — please retry'),
  });

  const addItem = useMutation({
    mutationFn: (data) => inventoryApi.addItem(data),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setShowAdd(false);
      showToast('✓ Item added');
    },
  });

  return (
    <div className="page-body">
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast${toast.startsWith('✓') ? ' success' : toast.startsWith('⚠') ? ' error' : ''}`}>
            {toast}
          </div>
        </div>
      )}

      {showAdd && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onSave={(data) => addItem.mutate(data)}
        />
      )}

      {/* P1-D: Import CSV Modal */}
      {showImport && (
        <ImportCSVModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            showToast('✓ Import complete — inventory updated');
            setShowImport(false);
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Inventory</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
            {items.length} items
            {lowStock > 0 && (
              <span style={{ color: 'var(--warning)', fontWeight: 600, marginLeft: 8 }}>
                · ⚠ {lowStock} low stock
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
          <button
            style={{
              padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', cursor: 'pointer',
            }}
            onClick={() => setShowImport(true)}
          >
            📥 Import CSV
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Item
          </button>
        </div>
      </div>

      {/* Search + Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s5)', flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {/* P5-5A: Low Stock filter tabs */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
          <button
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none',
              background: !showLowStockOnly ? 'var(--primary)' : 'var(--surface-2)',
              color:      !showLowStockOnly ? '#fff' : 'var(--text)',
              cursor: 'pointer',
            }}
            onClick={() => setShowLowStockOnly(false)}
          >
            All ({allItems.length})
          </button>
          <button
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none',
              borderLeft: '1px solid var(--border)',
              background: showLowStockOnly ? '#DC2626' : 'var(--surface-2)',
              color:      showLowStockOnly ? '#fff' : lowStock > 0 ? '#DC2626' : 'var(--text)',
              cursor: 'pointer',
            }}
            onClick={() => setShowLowStockOnly(true)}
          >
            🔴 Low Stock {lowStock > 0 ? `(${lowStock})` : '(0)'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table data-testid="inventory-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Type</th>
              <th>Price</th>
              <th>MRP</th>
              <th>In Stock (qty)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              // P4-2C: TableSkeleton replaces inline loading text
              <tr><td colSpan={7} style={{ padding: 0 }}><TableSkeleton rows={8} cols={7} showHeader={false} /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                No items found. {search ? 'Try a different search.' : 'Add your first item →'}
              </td></tr>
            ) : items.map(item => (
              <tr key={item.id} style={{ opacity: item.is_in_stock ? 1 : 0.5 }}>
                <td>
                  <div style={{ fontWeight: 500 }}>{item.products?.name || item.product_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{item.products?.unit || item.unit}</div>
                </td>
                <td>
                  <span className={`badge badge-${item.products?.delivery_tier || 'quick'}`}>
                    {item.products?.delivery_tier === 'quick' ? '⚡ Quick' : '📅 Scheduled'}
                  </span>
                </td>
                <td>
                  <EditableCell
                    prefix="₹"
                    value={item.price}
                    onSave={(v) => update.mutate({ id: item.id, data: { price: Math.round(v * 100) } })}
                  />
                </td>
                <td>
                  <EditableCell
                    prefix="₹"
                    value={item.mrp}
                    onSave={(v) => update.mutate({ id: item.id, data: { mrp: Math.round(v * 100) } })}
                  />
                </td>
                <td>
                  <EditableCell
                    value={item.stock_quantity}
                    onSave={(v) => update.mutate({ id: item.id, data: { stock_quantity: v } })}
                  />
                  {/* P5-5A: use per-item threshold, sort low-stock rows to top */}
                  {item.stock_quantity <= (item.low_stock_threshold ?? 5) && item.stock_quantity > 0 && (
                    <span style={{
                      display: 'inline-block', marginLeft: 6,
                      background: '#FEF3C7', color: '#92400E',
                      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    }}>Low</span>
                  )}
                  {item.stock_quantity === 0 && (
                    <span style={{
                      display: 'inline-block', marginLeft: 6,
                      background: '#FEE2E2', color: '#DC2626',
                      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    }}>OUT</span>
                  )}
                </td>
                <td>
                  <AvailableToggle
                    value={item.is_in_stock}
                    onChange={(v) => update.mutate({ id: item.id, data: { is_in_stock: v } })}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (window.confirm('Remove this item from inventory?')) {
                        inventoryApi.removeItem(item.id).then(() => {
                          queryClient.invalidateQueries({ queryKey: ['inventory'] });
                          showToast('Item removed');
                        });
                      }
                    }}
                    style={{ color: 'var(--error)' }}
                  >
                    Remove
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
