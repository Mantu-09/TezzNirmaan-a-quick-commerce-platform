'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '../../../../../lib/api';

// ── Shared primitives ─────────────────────────────────────────────────────────

const baseInput = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
  fontSize: 14, background: 'var(--surface)', color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

function FormSection({ title, icon, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', marginBottom: 'var(--s5)' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
}

function FormField({ label, required, error, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: error ? 'var(--error)' : 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}{required && <span style={{ color: 'var(--error)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint  && !error && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}

// ── Specs editor ──────────────────────────────────────────────────────────────

function SpecsEditor({ value = {}, onChange }) {
  const entries = Object.entries(value);
  const updateKey = (old, newKey) => {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k === old ? newKey : k] = v;
    onChange(out);
  };
  const updateVal = (key, val) => onChange({ ...value, [key]: val });
  const addRow    = () => onChange({ ...value, [`Property ${entries.length + 1}`]: '' });
  const removeRow = (key) => { const u = { ...value }; delete u[key]; onChange(u); };

  return (
    <div>
      {entries.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px', fontStyle: 'italic' }}>
          No specifications yet. Add key/value pairs.
        </p>
      )}
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
          <input value={k} onChange={e => updateKey(k, e.target.value)} placeholder="Property" style={{ ...baseInput }} />
          <input value={v} onChange={e => updateVal(k, e.target.value)} placeholder="Value" style={{ ...baseInput }} />
          <button type="button" onClick={() => removeRow(k)}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontWeight: 600 }}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow}
        style={{ padding: '7px 14px', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        + Add Specification
      </button>
    </div>
  );
}

// ── R2 image uploader ─────────────────────────────────────────────────────────

function ImageUploader({ images = [], onChange }) {
  const inputRef = useRef();
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState('');

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const { data } = await adminApi.getImageUploadUrl('products', file.type || 'image/jpeg');
      const { upload_url, public_url } = data;
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`R2 upload failed: ${putRes.status}`);
      onChange([...images, public_url]);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: images.length ? 12 : 0 }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img src={url} alt={`img-${i}`}
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: `2px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'}` }} />
            {i === 0 && (
              <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--primary)', background: 'rgba(255,255,255,0.85)', padding: '1px 0' }}>PRIMARY</span>
            )}
            <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))}
              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, lineHeight: '20px', padding: 0 }}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ padding: '9px 18px', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', background: uploading ? 'var(--surface-2)' : 'transparent', color: 'var(--text-2)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
          {uploading ? '⏳ Uploading…' : '📁 Upload Image'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>JPEG · PNG · WebP · AVIF · First image = primary thumbnail</span>
      </div>
      {uploadError && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--error)' }}>⚠️ {uploadError}</p>}
    </div>
  );
}

// ── Archive confirm modal ─────────────────────────────────────────────────────

function ArchiveModal({ product, onClose, onDone }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const isActive = product.is_active;

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.archiveProduct(product.id);
      onDone(res?.data?.product);
    } catch (err) {
      setError(err.message || 'Action failed');
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: 32, width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>{isActive ? '🗄️' : '✅'}</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px', textAlign: 'center', color: 'var(--text)' }}>
          {isActive ? 'Archive this product?' : 'Restore this product?'}
        </h3>
        <p style={{ color: 'var(--text-2)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          {isActive
            ? 'Archiving hides this product from shop owners. Existing inventory items are not removed.'
            : 'Restoring makes this product visible to shop owners again in the master catalog.'}
        </p>
        {error && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>⚠️ {error}</p>}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={confirm} disabled={busy} style={{
            flex: 1, padding: '10px', borderRadius: 'var(--r-md)',
            background: busy ? 'var(--border)' : (isActive ? 'var(--error)' : '#16a34a'),
            color: '#fff', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}>
            {busy ? '⏳…' : (isActive ? 'Archive' : 'Restore')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const UNITS     = ['piece', 'kg', 'bag', 'litre', 'meter', 'sq_ft', 'cu_ft', 'bundle', 'box', 'pair', 'set', 'ton', 'brass', 'cft'];
const GST_RATES = [0, 5, 12, 18, 28];

export default function EditProductPage() {
  const router     = useRouter();
  const { id }     = useParams();

  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState('');
  const [categories,  setCategories]  = useState([]);
  const [brands,      setBrands]      = useState([]);
  const [form,        setFormState]   = useState(null);
  const [errors,      setErrors]      = useState({});
  const [focused,     setFocused]     = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [saved,       setSaved]       = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [product,     setProduct]     = useState(null);   // the live product obj for archive modal

  useEffect(() => {
    Promise.all([
      adminApi.getProduct(id),
      adminApi.getCategories(),
      adminApi.getBrands(),
    ]).then(([pRes, catRes, brandRes]) => {
      const p = pRes?.data?.product || pRes;
      setProduct(p);
      setCategories(catRes?.data?.categories || catRes?.categories || []);
      setBrands(brandRes?.data?.brands || brandRes?.brands || []);
      const dims = p.dimensions || {};
      setFormState({
        name:           p.name        || '',
        slug:           p.slug        || '',
        description:    p.description || '',
        categoryId:     p.category_id || '',
        brandId:        p.brand_id    || '',
        deliveryTier:   p.delivery_tier || 'quick',
        unit:           p.unit        || 'bag',
        weightKg:       p.weight_kg   != null ? String(p.weight_kg) : '',
        isBulk:         p.is_bulk     || false,
        hsnCode:        p.hsn_code    || '',
        gstPercent:     p.gst_percent != null ? p.gst_percent : 18,
        images:         p.images      || [],
        specifications: p.specifications || {},
        length_cm:      dims.length_cm  != null ? String(dims.length_cm)  : '',
        width_cm:       dims.width_cm   != null ? String(dims.width_cm)   : '',
        height_cm:      dims.height_cm  != null ? String(dims.height_cm)  : '',
        volume_cft:     dims.volume_cft != null ? String(dims.volume_cft) : '',
      });
    }).catch(err => {
      setLoadError(err.message || 'Could not load product');
    }).finally(() => setLoading(false));
  }, [id]);

  function set(key, val) {
    setFormState(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }));
  }

  function iStyle(field) {
    return {
      ...baseInput,
      ...(errors[field]  ? { border: '1px solid var(--error)' } : {}),
      ...(focused === field ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 3px rgba(232,116,12,0.15)' } : {}),
    };
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.slug.trim()) e.slug = 'Required';
    else if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Lowercase letters, numbers, hyphens only';
    if (!form.categoryId) e.categoryId = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const dims = [form.length_cm, form.width_cm, form.height_cm, form.volume_cft].some(Boolean)
        ? {
            length_cm:  form.length_cm  ? +form.length_cm  : undefined,
            width_cm:   form.width_cm   ? +form.width_cm   : undefined,
            height_cm:  form.height_cm  ? +form.height_cm  : undefined,
            volume_cft: form.volume_cft ? +form.volume_cft : undefined,
          }
        : null;

      const updated = await adminApi.updateProduct(id, {
        name:           form.name,
        slug:           form.slug,
        description:    form.description || undefined,
        categoryId:     form.categoryId,
        brandId:        form.brandId || undefined,
        deliveryTier:   form.deliveryTier,
        unit:           form.unit,
        weightKg:       form.weightKg ? +form.weightKg : undefined,
        isBulk:         form.isBulk,
        hsnCode:        form.hsnCode || undefined,
        gstPercent:     +form.gstPercent,
        images:         form.images,
        specifications: form.specifications,
        dimensions:     dims,
      });
      setProduct(updated?.data?.product || updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSubmitError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleArchiveDone(updatedProduct) {
    setProduct(updatedProduct);
    setShowArchive(false);
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-2)', fontFamily: 'var(--font)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        Loading product…
      </div>
    );
  }

  if (loadError || !form) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', fontFamily: 'var(--font)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>❌</div>
        <p style={{ color: 'var(--error)', marginBottom: 20 }}>{loadError || 'Product not found'}</p>
        <Link href="/admin/products">
          <button style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            ← Back to Products
          </button>
        </Link>
      </div>
    );
  }

  const isActive = product?.is_active !== false;

  return (
    <div style={{ fontFamily: 'var(--font)', maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
      <style>{`@keyframes fadeDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>

      {/* Saved toast */}
      {saved && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', background: '#16a34a', color: '#fff', borderRadius: 'var(--r-md)', fontWeight: 600, fontSize: 14, boxShadow: 'var(--shadow-md)', animation: 'fadeDown 0.2s ease' }}>
          ✓ Changes saved
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/admin/products" style={{ color: 'var(--text-3)', textDecoration: 'none', fontSize: 13 }}>← Products</Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{form.name}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-2)' }}>{form.slug}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Active/Archived badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: isActive ? 'rgba(22,163,74,0.1)' : 'rgba(107,114,128,0.1)',
            color: isActive ? 'var(--success)' : 'var(--text-3)',
            border: `1px solid ${isActive ? 'rgba(22,163,74,0.25)' : 'rgba(107,114,128,0.2)'}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? 'var(--success)' : 'var(--text-3)' }} />
            {isActive ? 'Active' : 'Archived'}
          </span>
          {/* Archive/Restore button */}
          <button onClick={() => setShowArchive(true)} style={{
            padding: '7px 16px', borderRadius: 'var(--r-md)', fontSize: 12, fontWeight: 700,
            border: `1px solid ${isActive ? 'rgba(220,38,38,0.3)' : 'rgba(22,163,74,0.3)'}`,
            background: isActive ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.06)',
            color: isActive ? 'var(--error)' : 'var(--success)', cursor: 'pointer',
          }}>
            {isActive ? '🗄️ Archive' : '✅ Restore'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>

        {/* Identity */}
        <FormSection title="Product Identity" icon="📦">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <FormField label="Product Name" required error={errors.name}>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                style={iStyle('name')} />
            </FormField>
            <FormField label="Slug" required error={errors.slug} hint="Lowercase letters, numbers, hyphens only">
              <input value={form.slug} onChange={e => set('slug', e.target.value)}
                onFocus={() => setFocused('slug')} onBlur={() => setFocused(null)}
                style={iStyle('slug')} />
            </FormField>
          </div>
          <FormField label="Description" hint="Shown on product detail page">
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} style={{ ...baseInput, resize: 'vertical' }} />
          </FormField>
        </FormSection>

        {/* Classification */}
        <FormSection title="Classification" icon="🏷️">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <FormField label="Category" required error={errors.categoryId}>
              <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}
                style={{ ...baseInput, cursor: 'pointer', ...(errors.categoryId ? { border: '1px solid var(--error)' } : {}) }}>
                <option value="">— Select Category —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Brand">
              <select value={form.brandId} onChange={e => set('brandId', e.target.value)}
                style={{ ...baseInput, cursor: 'pointer' }}>
                <option value="">— Generic / No Brand —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <FormField label="Delivery Type">
              <select value={form.deliveryTier} onChange={e => set('deliveryTier', e.target.value)} style={{ ...baseInput, cursor: 'pointer' }}>
                <option value="quick">⚡ Quick (60–90 min)</option>
                <option value="scheduled">📅 Scheduled (next-day)</option>
              </select>
            </FormField>
            <FormField label="Unit">
              <select value={form.unit} onChange={e => set('unit', e.target.value)} style={{ ...baseInput, cursor: 'pointer' }}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
            <FormField label="Bulk / Heavy?">
              <div style={{ paddingTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                  <input type="checkbox" checked={form.isBulk} onChange={e => set('isBulk', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  Mark as bulk
                </label>
              </div>
            </FormField>
          </div>
        </FormSection>

        {/* Tax */}
        <FormSection title="Tax & Compliance" icon="🧾">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <FormField label="GST %">
              <select value={form.gstPercent} onChange={e => set('gstPercent', e.target.value)} style={{ ...baseInput, cursor: 'pointer' }}>
                {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </FormField>
            <FormField label="HSN Code" hint="6–8 digit harmonised code">
              <input value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)}
                onFocus={() => setFocused('hsnCode')} onBlur={() => setFocused(null)}
                style={iStyle('hsnCode')} placeholder="e.g. 252329" />
            </FormField>
            <FormField label="Weight (kg)">
              <input type="number" min={0} step={0.1} value={form.weightKg} onChange={e => set('weightKg', e.target.value)}
                onFocus={() => setFocused('weightKg')} onBlur={() => setFocused(null)}
                style={iStyle('weightKg')} placeholder="50" />
            </FormField>
          </div>
        </FormSection>

        {/* Dimensions */}
        <FormSection title="Dimensions" icon="📐">
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>Optional — display and logistics estimation.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
            {[['length_cm','Length (cm)'],['width_cm','Width (cm)'],['height_cm','Height (cm)'],['volume_cft','Volume (cft)']].map(([k, lbl]) => (
              <FormField key={k} label={lbl}>
                <input type="number" min={0} step={0.01} value={form[k]} onChange={e => set(k, e.target.value)} style={baseInput} placeholder="0" />
              </FormField>
            ))}
          </div>
        </FormSection>

        {/* Specifications */}
        <FormSection title="Specifications" icon="📋">
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>Key/value pairs shown on product detail page (e.g. Grade → OPC 53).</p>
          <SpecsEditor value={form.specifications} onChange={v => set('specifications', v)} />
        </FormSection>

        {/* Images */}
        <FormSection title="Product Images" icon="🖼️">
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>Upload to Cloudflare R2. First image = primary thumbnail.</p>
          <ImageUploader images={form.images} onChange={v => set('images', v)} />
        </FormSection>

        {/* Submit */}
        {submitError && (
          <div style={{ marginBottom: 16, padding: 14, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--r-md)', color: 'var(--error)', fontSize: 13 }}>
            ⚠️ {submitError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Link href="/admin/products">
            <button type="button" style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              Cancel
            </button>
          </Link>
          <button type="submit" disabled={submitting} style={{
            padding: '10px 28px', borderRadius: 'var(--r-md)',
            background: submitting ? 'var(--border)' : 'var(--primary)', color: '#fff',
            border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 14,
            boxShadow: submitting ? 'none' : '0 2px 8px rgba(232,116,12,0.3)', transition: 'all 0.15s',
          }}>
            {submitting ? '⏳ Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </form>

      {/* Archive / Restore modal */}
      {showArchive && product && (
        <ArchiveModal
          product={product}
          onClose={() => setShowArchive(false)}
          onDone={handleArchiveDone}
        />
      )}
    </div>
  );
}
