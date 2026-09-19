'use client';
// ─────────────────────────────────────────────────────────────────────────────
// HomepageProducts.jsx
// Shows live product grid at the top of the homepage.
// Fetches from public catalog API, writes to localStorage cart (tn_web_cart).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';

const API = process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:3000';
const CART_KEY = 'tn_web_cart';

// ── Cart helpers ──────────────────────────────────────────────────────────────
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('storage')); // notify MarketingNav
}
function addToCart(product) {
  const cart = getCart();
  const idx  = cart.findIndex(i => i.inventory_id === product.inventory_id);
  if (idx >= 0) {
    cart[idx].quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }
  saveCart(cart);
  return cart;
}
function updateQty(inventory_id, delta) {
  const cart = getCart();
  const idx  = cart.findIndex(i => i.inventory_id === inventory_id);
  if (idx < 0) return cart;
  cart[idx].quantity += delta;
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  saveCart(cart);
  return cart;
}
function getQty(cart, inventory_id) {
  return cart.find(i => i.inventory_id === inventory_id)?.quantity || 0;
}

// ── Category Pill ──────────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Construction', 'Paints', 'Tiles', 'Electrical', 'Plumbing', 'Hardware', 'Decor'];

// ── Product Card ───────────────────────────────────────────────────────────────
function ProductCard({ product, qty, onAdd, onInc, onDec }) {
  const priceRs      = Math.floor((product.discounted_price || product.price) / 100);
  const originalRs   = product.discounted_price && product.discounted_price < product.price
    ? Math.floor(product.price / 100) : null;
  const discountPct  = originalRs
    ? Math.round((1 - (product.discounted_price / product.price)) * 100) : null;

  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      border: '1px solid #f0f0f0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'box-shadow 0.15s, transform 0.15s',
      cursor: 'pointer',
      position: 'relative',
    }}
      onMouseOver={e => { e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.10)'; e.currentTarget.style.transform='translateY(-2px)'; }}
      onMouseOut={e  => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)'; }}
    >
      {/* Discount badge */}
      {discountPct && (
        <div style={{
          position:'absolute', top:10, left:10, zIndex:2,
          background:'#E8740C', color:'#fff',
          fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:6,
        }}>{discountPct}% OFF</div>
      )}

      {/* Image */}
      <div style={{
        width:'100%', aspectRatio:'1/1',
        background:'#f8fafc',
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden',
      }}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width:'100%', height:'100%', objectFit:'cover' }}
            loading="lazy"
          />
        ) : (
          <div style={{ fontSize:40 }}>📦</div>
        )}
      </div>

      {/* Details */}
      <div style={{ padding:'10px 12px', flex:1, display:'flex', flexDirection:'column', gap:4 }}>
        <div style={{ fontSize:13, fontWeight:400, color:'#94a3b8', lineHeight:1.2 }}>
          {product.brand_name || product.category_name || ''}
        </div>
        <div style={{ fontSize:14, fontWeight:600, color:'#0f172a', lineHeight:1.3, flex:1 }}>
          {product.name}
        </div>
        {product.unit && (
          <div style={{ fontSize:11, color:'#94a3b8' }}>{product.unit}</div>
        )}

        {/* Price row + Add button */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
          <div>
            <span style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>
              ₹{priceRs.toLocaleString('en-IN')}
            </span>
            {originalRs && (
              <span style={{ fontSize:12, color:'#94a3b8', textDecoration:'line-through', marginLeft:5 }}>
                ₹{originalRs.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Add / stepper */}
          {qty === 0 ? (
            <button
              onClick={e => { e.stopPropagation(); onAdd(product); }}
              style={{
                display:'flex', alignItems:'center', gap:4,
                padding:'6px 14px', borderRadius:8, border:'none',
                background:'#0a7c00', color:'#fff',
                fontWeight:700, fontSize:13, cursor:'pointer',
                fontFamily:'inherit', transition:'background 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.background='#086600'}
              onMouseOut={e  => e.currentTarget.style.background='#0a7c00'}
            >
              + Add
            </button>
          ) : (
            <div style={{
              display:'flex', alignItems:'center', gap:0,
              border:'1.5px solid #0a7c00', borderRadius:8, overflow:'hidden',
            }}>
              <button onClick={e => { e.stopPropagation(); onDec(product.inventory_id); }}
                style={{ width:30, height:30, border:'none', background:'#0a7c00', color:'#fff', fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
              <span style={{ width:28, textAlign:'center', fontSize:14, fontWeight:700, color:'#0a7c00' }}>{qty}</span>
              <button onClick={e => { e.stopPropagation(); onInc(product.inventory_id); }}
                style={{ width:30, height:30, border:'none', background:'#0a7c00', color:'#fff', fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function HomepageProducts() {
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [category,  setCategory]  = useState('All');
  const [cart,      setCart]      = useState([]);

  // City from cookie
  const city = (typeof window !== 'undefined' ? Cookies.get('tn_city') : null) || 'Patna';

  // Load cart on mount
  useEffect(() => { setCart(getCart()); }, []);

  // Read category from URL ?cat= param (set by clicking the category cards above)
  useEffect(() => {
    function readCat() {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('cat');
      setCategory(cat && cat !== 'All' ? cat : 'All');
    }
    readCat();
    window.addEventListener('popstate', readCat);
    return () => window.removeEventListener('popstate', readCat);
  }, []);

  // Fetch products when category or city changes
  useEffect(() => {
    setLoading(true);
    const cat = category !== 'All' ? `&category=${encodeURIComponent(category)}` : '';
    fetch(`${API}/api/v1/public/catalog?city=${city}&limit=40${cat}`)
      .then(r => r.json())
      .then(data => {
        const items = data?.data?.products || data?.data || data?.products || [];
        setProducts(Array.isArray(items) ? items : []);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [city, category]);

  function handleAdd(product) { setCart(addToCart(product)); }
  function handleInc(inventory_id) { setCart(updateQty(inventory_id, +1)); }
  function handleDec(inventory_id) { setCart(updateQty(inventory_id, -1)); }

  return (
    <div style={{
      background: '#f7f6f3',
      padding: '24px 0 32px',
      borderBottom: '1px solid #e8ecf0',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>

        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#E8740C', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>
              {category !== 'All' ? category : 'All Products'} · Delivering in {city}
            </div>
            <h2 style={{ fontSize:20, fontWeight:800, color:'#0f172a', margin:0, lineHeight:1.2 }}>
              Order now, delivered in 60 min
            </h2>
          </div>
          <a href="/search" style={{
            fontSize:13, fontWeight:600, color:'#E8740C',
            textDecoration:'none', padding:'6px 14px',
            border:'1.5px solid #E8740C', borderRadius:8,
          }}>
            View all →
          </a>
        </div>


        {/* Products grid */}
        {loading ? (
          <div style={{
            display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',
            gap:14,
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                background:'#fff', borderRadius:14, height:260,
                animation:'tn-pulse 1.2s ease-in-out infinite',
              }}/>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div style={{
            textAlign:'center', padding:'48px 20px',
            background:'#fff', borderRadius:14,
          }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🏗️</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#0f172a', marginBottom:8 }}>
              Products coming soon for {city}
            </div>
            <div style={{ fontSize:14, color:'#64748b' }}>
              We're onboarding shops in your area. Check back shortly.
            </div>
          </div>
        ) : (
          <div style={{
            display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(168px, 1fr))',
            gap:14,
          }}>
            {products.map(p => (
              <ProductCard
                key={p.inventory_id || p.id}
                product={p}
                qty={getQty(cart, p.inventory_id)}
                onAdd={handleAdd}
                onInc={handleInc}
                onDec={handleDec}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes tn-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
