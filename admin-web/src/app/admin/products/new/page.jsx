'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '../../../../lib/api';

// ── Shared primitives (identical to admin/shops/new pattern) ─────────────────

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
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.2px' }}>{title}</h2>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
}

function FormField({ label, required, error, hint, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: error ? 'var(--error)' : 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}{required && <span style={{ color: 'var(--error)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}

// ── Specs key/value editor ────────────────────────────────────────────────────

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
          No specifications yet. Add key/value pairs like "Grade: OPC 53" or "BIS Standard: IS 12269".
        </p>
      )}
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
          <input value={k} onChange={e => updateKey(k, e.target.value)} placeholder="Property" style={{ ...baseInput }} />
          <input value={v} onChange={e => updateVal(k, e.target.value)} placeholder="Value" style={{ ...baseInput }} />
          <button type="button" onClick={() => removeRow(k)} title="Remove"
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

// ── R2 image uploader (reuses admin/images/upload-url) ───────────────────────

function ImageUploader({ images = [], onChange }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      // 1. Get presigned URL from backend
      const { data } = await adminApi.getImageUploadUrl('products', file.type || 'image/jpeg');
      const { upload_url, public_url } = data;

      // 2. PUT file bytes directly to R2 — never through Node.js
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`R2 upload failed: ${putRes.status}`);

      // 3. Append the public CDN URL to the images list
      onChange([...images, public_url]);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function removeImage(idx) {
    onChange(images.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {/* Existing images */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: images.length ? 12 : 0 }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img src={url} alt={`Image ${i + 1}`}
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: `2px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'}` }} />
            {i === 0 && (
              <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--primary)', background: 'rgba(255,255,255,0.85)', padding: '1px 0' }}>PRIMARY</span>
            )}
            <button type="button" onClick={() => removeImage(i)}
              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, lineHeight: '20px', textAlign: 'center', padding: 0 }}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Upload button */}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ padding: '9px 18px', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', background: uploading ? 'var(--surface-2)' : 'transparent', color: 'var(--text-2)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          {uploading ? '⏳ Uploading…' : '📁 Upload Image'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          JPEG, PNG, WebP, AVIF · First image is the primary thumbnail
        </span>
      </div>
      {uploadError && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--error)' }}>⚠️ {uploadError}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const UNITS = ['piece', 'kg', 'bag', 'litre', 'meter', 'sq_ft', 'cu_ft', 'bundle', 'box', 'pair', 'set', 'ton', 'brass', 'cft'];
const GST_RATES = [0, 5, 12, 18, 28];

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [brands,     setBrands]     = useState([]);
  const [refLoading, setRefLoading] = useState(true);

  const [form, setForm] = useState({
    name: '', slug: '', description: '',
    categoryId: '', brandId: '',
    deliveryTier: 'quick',
    unit: 'bag', weightKg: '', isBulk: false,
    hsnCode: '', gstPercent: 18,
    images: [],
    specifications: {},
    length_cm: '', width_cm: '', height_cm: '', volume_cft: '',
  });

  const [errors,      setErrors]      = useState({});
  const [focused,     setFocused]     = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created,     setCreated]     = useState(null);

  useEffect(() => {
    Promise.all([adminApi.getCategories(), adminApi.getBrands()])
      .then(([catRes, brandRes]) => {
        setCategories(catRes?.data?.categories || catRes?.categories || []);
        setBrands(brandRes?.data?.brands || brandRes?.brands || []);
      })
      .catch(() => {})
      .finally(() => setRefLoading(false));
  }, []);

  function set(key, val) {
    if (key === 'name') {
      const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setForm(f => ({ ...f, name: val, slug }));
    } else {
      setForm(f => ({ ...f, [key]: val }));
    }
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
    if (!form.name.trim())    e.name       = 'Product name is required';
    if (!form.slug.trim())    e.slug       = 'Slug is required';
    else if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Lowercase letters, numbers, hyphens only';
    if (!form.categoryId)     e.categoryId = 'Select a category';
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

      const res = await adminApi.createProduct({
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
      setCreated(res?.data?.product || res);
      setTimeout(() => router.push('/admin/products'), 3000);
    } catch (err) {
      setSubmitError(err.message || 'Failed to create product. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (created) {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Product Created!</h2>
        <p style={{ color: 'var(--text-2)', marginBottom: 4 }}>
          <strong>{created.name}</strong> is now in the master catalog.
        </p>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 24 }}>
          Shop owners can find it under Browse Catalog and add it to their inventory.<br />
          Redirecting to products list…
        </p>
        <Link href="/admin/products">
          <button style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>
            ← Back to Products
          </button>
        </Link>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--font)', maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>

      {/* Breadcrumb header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/products" style={{ color: 'var(--text-3)', textDecoration: 'none', fontSize: 13 }}>← Products</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Add to Master Catalog</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            This product becomes available to all shop owners to add to their inventory
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>

        {/* ── Identity ── */}
        <FormSection title="Product Identity" icon="📦">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <FormField label="Product Name" required error={errors.name}>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                style={iStyle('name')} placeholder="e.g. Ultratech PPC Cement 50kg" />
            </FormField>
            <FormField label="Slug" required error={errors.slug} hint="Lowercase, hyphens only. Auto-generated from name.">
              <input value={form.slug} onChange={e => set('slug', e.target.value)}
                onFocus={() => setFocused('slug')} onBlur={() => setFocused(null)}
                style={iStyle('slug')} placeholder="ultratech-ppc-cement-50kg" />
            </FormField>
          </div>
          <FormField label="Description" hint="Product detail page copy — grade, use case, certifications.">
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} style={{ ...baseInput, resize: 'vertical' }}
              placeholder="OPC 53 grade cement for structural work. BIS IS 12269 certified." />
          </FormField>
        </FormSection>

        {/* ── Classification ── */}
        <FormSection title="Classification" icon="🏷️">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <FormField label="Category" required error={errors.categoryId}>
              <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}
                style={{ ...baseInput, cursor: 'pointer', ...(errors.categoryId ? { border: '1px solid var(--error)' } : {}) }}
                disabled={refLoading}>
                <option value="">{refLoading ? 'Loading…' : '— Select Category —'}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Brand" hint="Leave blank for generic / unbranded">
              <select value={form.brandId} onChange={e => set('brandId', e.target.value)}
                style={{ ...baseInput, cursor: 'pointer' }} disabled={refLoading}>
                <option value="">{refLoading ? 'Loading…' : '— Generic / No Brand —'}</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <FormField label="Delivery Type" required>
              <select value={form.deliveryTier} onChange={e => set('deliveryTier', e.target.value)} style={{ ...baseInput, cursor: 'pointer' }}>
                <option value="quick">⚡ Quick (60–90 min)</option>
                <option value="scheduled">📅 Scheduled (next-day slot)</option>
              </select>
            </FormField>
            <FormField label="Unit of Measure">
              <select value={form.unit} onChange={e => set('unit', e.target.value)} style={{ ...baseInput, cursor: 'pointer' }}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
            <FormField label="Bulk / Heavy Material?">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                  <input type="checkbox" checked={form.isBulk} onChange={e => set('isBulk', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  Yes — mark as bulk
                </label>
              </div>
            </FormField>
          </div>
        </FormSection>

        {/* ── Tax & Compliance ── */}
        <FormSection title="Tax & Compliance" icon="🧾">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <FormField label="GST %" hint="Standard rate: 18% for construction materials">
              <select value={form.gstPercent} onChange={e => set('gstPercent', e.target.value)} style={{ ...baseInput, cursor: 'pointer' }}>
                {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </FormField>
            <FormField label="HSN Code" hint="6–8 digit harmonised system number">
              <input value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)}
                onFocus={() => setFocused('hsnCode')} onBlur={() => setFocused(null)}
                style={iStyle('hsnCode')} placeholder="e.g. 252329" />
            </FormField>
            <FormField label="Weight (kg)" hint="Actual weight for logistics">
              <input type="number" min={0} step={0.1} value={form.weightKg} onChange={e => set('weightKg', e.target.value)}
                onFocus={() => setFocused('weightKg')} onBlur={() => setFocused(null)}
                style={iStyle('weightKg')} placeholder="50" />
            </FormField>
          </div>
        </FormSection>

        {/* ── Dimensions ── */}
        <FormSection title="Dimensions" icon="📐">
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>Optional — used for display and delivery logistics estimation.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
            {[['length_cm','Length (cm)'],['width_cm','Width (cm)'],['height_cm','Height (cm)'],['volume_cft','Volume (cft)']].map(([k, lbl]) => (
              <FormField key={k} label={lbl}>
                <input type="number" min={0} step={0.01} value={form[k]} onChange={e => set(k, e.target.value)}
                  style={baseInput} placeholder="0" />
              </FormField>
            ))}
          </div>
        </FormSection>

        {/* ── Specifications ── */}
        <FormSection title="Specifications" icon="📋">
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
            Key/value pairs shown on product detail page. Examples: Grade → OPC 53, BIS Standard → IS 12269, Setting Time → 30 min.
          </p>
          <SpecsEditor value={form.specifications} onChange={v => set('specifications', v)} />
        </FormSection>

        {/* ── Images ── */}
        <FormSection title="Product Images" icon="🖼️">
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
            Upload to Cloudflare R2 — never stored on the server. First image = primary thumbnail.
          </p>
          <ImageUploader images={form.images} onChange={v => set('images', v)} />
        </FormSection>

        {/* ── Submit ── */}
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
            {submitting ? '⏳ Creating…' : '✓ Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
}
