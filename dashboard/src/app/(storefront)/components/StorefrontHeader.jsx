// ─────────────────────────────────────────────────────────────
// StorefrontHeader.jsx — P9-5 (Client component)
//
// Sticky header with:
//   • Logo (links to storefront home)
//   • City chip (Patna)
//   • Search bar → /storefront/search?q=...
//   • Cart icon with live item count
//   • Sign In / account link
// ─────────────────────────────────────────────────────────────
'use client';
import { useState } from 'react';
import Link         from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart }  from './CartProvider';

export default function StorefrontHeader() {
  const { itemCount } = useCart();
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) router.push(`/storefront/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className="sf-header">
      <div className="sf-header-inner">
        {/* Logo */}
        <Link href="/storefront" className="sf-logo">
          Tezz<span>Nirmaan</span>
        </Link>

        {/* City chip */}
        <div className="sf-city-chip sf-hidden-mobile">
          <span>📍</span> Patna
        </div>

        {/* Search */}
        <form className="sf-search" onSubmit={handleSearch}>
          <span className="sf-search-icon" aria-hidden="true">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input
            className="sf-search-input"
            type="search"
            placeholder="Search cement, paint, tiles…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search products"
          />
        </form>

        {/* Actions */}
        <div className="sf-header-actions">
          <Link href="/storefront/cart" className="sf-btn sf-cart-btn" aria-label={`Cart, ${itemCount} items`}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span className="sf-hidden-mobile">Cart</span>
            {itemCount > 0 && <span className="sf-cart-count">{itemCount > 99 ? '99+' : itemCount}</span>}
          </Link>
          <Link href="/storefront/auth" className="sf-btn sf-btn-ghost sf-hidden-mobile">
            Sign In
          </Link>
        </div>
      </div>

      {/* Delivery mode bar */}
      <div className="sf-mode-bar">
        <div className="sf-mode-bar-inner">
          <Link href="/storefront?mode=quick" className="sf-mode-tab active">
            ⚡ Quick (60–90 min)
          </Link>
          <Link href="/storefront?mode=scheduled" className="sf-mode-tab">
            📅 Scheduled (Today)
          </Link>
        </div>
      </div>
    </header>
  );
}
