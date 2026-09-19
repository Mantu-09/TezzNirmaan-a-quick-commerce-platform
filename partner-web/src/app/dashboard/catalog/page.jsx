'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { inventoryApi, api } from '../../../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// "Add to My Shop" modal — Session D spec:
//   • price + mrp required at add-time
//   • stock_quantity optional, defaults to 0
//   • is_listed defaults to FALSE (owner must actively list it)
//   • shop_sku / shop_description / shop_images in expandable section
// ─────────────────────────────────────────────────────────────────────────────

function AddToInventoryModal({ product, onClose, onAdded }) {
  const [form, setForm] = useState({
    price:             '',
    mrp:               '',
    stockQuantity:     '0',          // default 0
    lowStockThreshold: '5',
    isListed:          false,        // start disabled per spec
    // Expandable "customize" section
    shopSku:         '',
    shopDescription: '',
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [alreadyExists, setAlreadyExists] = useState(false);

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
    setSubmitError('');
    setAlreadyExists(false);
  }

  function validate() {
    const e = {};
    if (!form.price || isNaN(form.price) || Number(form.price) <= 0)
      e.price = 'Enter a valid selling price (₹)';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError('');
    setAlreadyExists(false);
    try {
      await inventoryApi.addItem({
        productId:         product.id,
        price:             Math.round(parseFloat(form.price) * 100),
        mrp:               form.mrp ? Math.round(parseFloat(form.mrp) * 100) : undefined,
        stockQuantity:     parseFloat(form.stockQuantity) || 0,
        lowStockThreshold: parseFloat(form.lowStockThreshold) || 5,
        isListed:          form.isListed,
        shopSku:           form.shopSku   || undefined,
        shopDescription:   form.shopDescription || undefined,
      });
      onAdded(product.id);
      onClose();
    } catch (err) {
      if (err.status === 409) {
        setAlreadyExists(true);
      } else {
        setSubmitError(err.message || 'Failed to add product. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inp = {
    width: '100%', padding: '10px 12px',
    border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
    fontSize: 14, background: 'var(--bg)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
    transition: 'border-color 0.15s',
  };

  const errInp = { ...inp, border: '1px solid var(--error)' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />

      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-xl)', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            {(product.primary_image_url || product.images?.[0])
              ? <img src={product.primary_image_url || product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : '📦'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{product.name}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
              {product.categories?.name} · {product.delivery_tier === 'quick' ? '⚡ Quick' : '📅 Scheduled'} · per {product.unit} · GST {product.gst_percent}%
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}>✕</button>
        </div>

        {/* Already-exists error */}
        {alreadyExists && (
          <div style={{ margin: '16px 24px 0', padding: 14, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--r-md)', fontSize: 13, color: '#3b82f6' }}>
            <strong>Already in your inventory!</strong> This product is already added.{' '}
            <Link href="/dashboard/inventory" style={{ color: '#3b82f6', fontWeight: 700 }} onClick={onClose}>
              Go to Inventory →
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>

          {/* Pricing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: errors.price ? 'var(--error)' : 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Your Price (₹) <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <input type="number" min="0.01" step="0.01" value={form.price} onChange={e => set('price', e.target.value)}
                style={errors.price ? errInp : inp} placeholder="e.g. 350" />
              {errors.price && <span style={{ fontSize: 11, color: 'var(--error)', display: 'block', marginTop: 4 }}>{errors.price}</span>}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                MRP (₹) <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>optional</span>
              </label>
              <input type="number" min="0" step="0.01" value={form.mrp} onChange={e => set('mrp', e.target.value)}
                style={inp} placeholder="Max retail price" />
            </div>
          </div>

          {/* Stock */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Opening Stock ({product.unit}) <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>optional, default 0</span>
              </label>
              <input type="number" min="0" step="0.001" value={form.stockQuantity} onChange={e => set('stockQuantity', e.target.value)}
                style={inp} placeholder="0" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Low Stock Alert At
              </label>
              <input type="number" min="0" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', e.target.value)} style={inp} />
            </div>
          </div>

          {/* is_listed toggle — defaults OFF per spec */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isListed} onChange={e => set('isListed', e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>List immediately on your storefront</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                Leave unchecked (recommended) to add to inventory first, then list when stock is ready.
                Customers <strong>cannot order</strong> until listed.
              </div>
            </div>
          </label>

          {/* ── Expandable "Customize for my shop" section ── */}
          <button type="button" onClick={() => setCustomOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', cursor: 'pointer', marginBottom: customOpen ? 0 : 20 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>🎨 Customize for my shop <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span></span>
            <span style={{ fontSize: 14, color: 'var(--text-3)', transition: 'transform 0.2s', transform: customOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>

          {customOpen && (
            <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--r-md) var(--r-md)', padding: 16, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
                Override the master catalog details with your own — your customers see these instead.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                    Your SKU / Internal Code
                  </label>
                  <input value={form.shopSku} onChange={e => set('shopSku', e.target.value)} style={inp} placeholder="Your barcode or internal product code" />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                    Your Description
                  </label>
                  <textarea value={form.shopDescription} onChange={e => set('shopDescription', e.target.value)}
                    rows={2} style={{ ...inp, resize: 'vertical' }}
                    placeholder="Custom description shown to your customers…" />
                </div>
              </div>
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <div style={{ marginBottom: 16, padding: 12, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--r-md)', color: 'var(--error)', fontSize: 13 }}>
              ⚠️ {submitError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              style={{ flex: 2, padding: '11px', borderRadius: 'var(--r-md)', background: submitting ? 'var(--border)' : 'var(--primary)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: submitting ? 'none' : '0 2px 8px rgba(232,116,12,0.3)', transition: 'all 0.15s' }}>
              {submitting ? '⏳ Adding…' : '+ Add to My Shop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Product card — two states: "add" (not in inventory) and "in inventory" (show status)
// ─────────────────────────────────────────────────────────────────────────────

function CatalogCard({ product, onAdd, justAdded }) {
  const inv      = product.inventory;
  const inInv    = !!inv || justAdded;
  const isQuick  = product.delivery_tier === 'quick';
  const imgUrl   = product.primary_image_url || product.images?.[0];

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--r-lg)', overflow: 'hidden',
      border: `1px solid ${inInv ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
      boxShadow: inInv ? '0 0 0 2px rgba(22,163,74,0.08)' : 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column',
      transition: 'box-shadow 0.15s, border-color 0.15s',
    }}>
      {/* Thumbnail */}
      <div style={{ position: 'relative', paddingTop: '60%', background: 'var(--surface-2)' }}>
        {imgUrl
          ? <img src={imgUrl} alt={product.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: 'var(--text-3)' }}>📦</div>
        }
        {/* Tier badge */}
        <span style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: isQuick ? 'rgba(232,116,12,0.88)' : 'rgba(59,130,246,0.88)', color: '#fff' }}>
          {isQuick ? '⚡ Quick' : '📅 Sched.'}
        </span>
        {/* In-inventory overlay */}
        {inInv && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: inv?.is_listed ? 'rgba(22,163,74,0.9)' : 'rgba(107,114,128,0.85)', color: '#fff' }}>
              {justAdded && !inv ? '✓ Added' : inv?.is_listed ? '● Listed' : '○ Unlisted'}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{product.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {product.categories?.name}{product.brands?.name ? ` · ${product.brands.name}` : ''}
        </div>

        {/* Inventory status row */}
        {inInv && inv && (
          <div style={{ padding: '8px 10px', background: 'rgba(22,163,74,0.06)', borderRadius: 8, border: '1px solid rgba(22,163,74,0.15)', fontSize: 12, marginTop: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-2)' }}>
              <span>Price: <strong style={{ color: 'var(--text)' }}>₹{(inv.price / 100).toFixed(0)}</strong></span>
              <span>Stock: <strong style={{ color: inv.is_in_stock ? 'var(--success)' : 'var(--error)' }}>{inv.stock_quantity} {product.unit}</strong></span>
            </div>
          </div>
        )}

        {/* Action button */}
        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {inInv ? (
            <Link href="/dashboard/inventory" style={{ display: 'block', textAlign: 'center', padding: '7px 12px', borderRadius: 'var(--r-md)', border: '1px solid rgba(22,163,74,0.3)', background: 'rgba(22,163,74,0.06)', color: 'var(--success)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Manage in Inventory →
            </Link>
          ) : (
            <button onClick={() => onAdd(product)}
              style={{ width: '100%', padding: '7px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--primary)', background: 'rgba(232,116,12,0.08)', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}>
              + Add to My Shop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

const TIERS = [
  { value: '', label: 'All' },
  { value: 'quick', label: '⚡ Quick' },
  { value: 'scheduled', label: '📅 Scheduled' },
];

export default function CatalogDiscoveryPage() {
  const queryClient = useQueryClient();

  // Filters
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [tier,         setTier]         = useState('');
  const [category,     setCategory]     = useState('');
  const [hideExisting, setHideExisting] = useState(false);

  // Modal + optimistic added set
  const [selected, setSelected] = useState(null);
  const [addedIds, setAddedIds] = useState(new Set());

  // ── Categories (stable, fetched once) ─────────────────────
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn:  () => api.get('/customer/categories'),
    staleTime: 5 * 60 * 1000,
  });
  const categories = Array.isArray(categoriesData)
    ? categoriesData
    : categoriesData?.data?.categories || categoriesData?.categories || [];

  // ── Master catalog (re-fetches on any filter change) ──────
  const catalogParams = { limit: 60, page: 1 };
  if (search)       catalogParams.search       = search;
  if (tier)         catalogParams.tier         = tier;
  if (category)     catalogParams.category     = category;
  if (hideExisting) catalogParams.hideExisting = 'true';

  const {
    data:    catalogData,
    isLoading: loading,
    error:   catalogError,
  } = useQuery({
    queryKey: ['catalog', search, tier, category, hideExisting],
    queryFn:  () => inventoryApi.getMasterCatalog(catalogParams),
    staleTime: 30 * 1000, // 30 s — catalog changes infrequently
  });

  const result      = catalogData?.data || catalogData || {};
  const products    = result.products   || [];
  const total       = result.pagination?.total       || 0;
  const alreadyCount = result.already_in_inventory   || 0;
  const error       = catalogError?.message          || '';

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function handleAdded(productId) {
    setAddedIds(prev => new Set([...prev, productId]));
    // Invalidate both catalog (so inventory status updates) and inventory list
    queryClient.invalidateQueries({ queryKey: ['catalog'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }



  const cardGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
    gap: 'var(--s5)',
  };

  return (
    <div style={{ fontFamily: 'var(--font)' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .chip:hover { border-color:var(--primary)!important; color:var(--primary)!important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Browse Master Catalog</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
          {loading ? 'Loading…' : (
            <>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{total}</span> products in catalog ·{' '}
              <span style={{ fontWeight: 700, color: 'var(--success)' }}>{alreadyCount}</span> already in your inventory
            </>
          )}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: '1 1 220px' }}>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Search cement, steel, bricks…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
          <button type="submit" style={{ padding: '8px 16px', borderRadius: 'var(--r-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Search
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }}
              style={{ padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>
              ✕
            </button>
          )}
        </form>

        {/* Category */}
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Tier chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {TIERS.map(t => (
            <button key={t.value} className="chip" onClick={() => setTier(t.value)} style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              border: `1px solid ${tier === t.value ? 'var(--primary)' : 'var(--border)'}`,
              background: tier === t.value ? 'rgba(232,116,12,0.1)' : 'transparent',
              color: tier === t.value ? 'var(--primary)' : 'var(--text-2)',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Hide existing toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          <input type="checkbox" checked={hideExisting} onChange={e => setHideExisting(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }} />
          Hide already-added
        </label>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginBottom: 16, padding: 14, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--r-md)', color: 'var(--error)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          ⚠️ {error}
          <button onClick={fetchCatalog} style={{ marginLeft: 'auto', padding: '4px 12px', border: '1px solid var(--error)', borderRadius: 6, background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={cardGrid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              <div style={{ paddingTop: '60%', background: 'linear-gradient(90deg,var(--surface-2) 25%,var(--border) 50%,var(--surface-2) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
              <div style={{ padding: 14 }}>
                <div style={{ height: 14, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 8 }} />
                <div style={{ height: 11, borderRadius: 6, background: 'var(--surface-2)', width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            {search ? `No products matching "${search}"` : 'No products found'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {search ? 'Try a different search term.' : hideExisting ? 'All catalog products are already in your inventory.' : 'The admin catalog is empty — ask your platform admin to add products.'}
          </div>
          {hideExisting && (
            <button onClick={() => setHideExisting(false)} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 'var(--r-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              Show All (including added)
            </button>
          )}
        </div>
      ) : (
        <div style={cardGrid}>
          {products.map(p => (
            <CatalogCard
              key={p.id}
              product={p}
              justAdded={addedIds.has(p.id)}
              onAdd={setSelected}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {selected && (
        <AddToInventoryModal
          product={selected}
          onClose={() => setSelected(null)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
