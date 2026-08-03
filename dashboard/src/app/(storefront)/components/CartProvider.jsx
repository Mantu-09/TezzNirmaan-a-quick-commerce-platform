// ─────────────────────────────────────────────────────────────
// CartProvider.jsx — P9-5
//
// Client component. Stores web cart in localStorage.
// Exposes cart state + actions via CartContext.
// Cart item shape: { inventory_id, product_id, name, price, discounted_price, image_url, quantity, shop_slug }
// ─────────────────────────────────────────────────────────────
'use client';
import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';

const CartContext = createContext(null);

const STORAGE_KEY = 'tn_web_cart';

function cartReducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return action.payload;

    case 'ADD': {
      const existing = state.findIndex(i => i.inventory_id === action.item.inventory_id);
      if (existing >= 0) {
        const next = [...state];
        next[existing] = { ...next[existing], quantity: next[existing].quantity + (action.item.quantity || 1) };
        return next;
      }
      return [...state, { ...action.item, quantity: action.item.quantity || 1 }];
    }

    case 'UPDATE': {
      if (action.quantity <= 0) {
        return state.filter(i => i.inventory_id !== action.inventory_id);
      }
      return state.map(i =>
        i.inventory_id === action.inventory_id ? { ...i, quantity: action.quantity } : i
      );
    }

    case 'REMOVE':
      return state.filter(i => i.inventory_id !== action.inventory_id);

    case 'CLEAR':
      return [];

    default:
      return state;
  }
}

export default function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) dispatch({ type: 'LOAD', payload: JSON.parse(stored) });
    } catch {}
    setHydrated(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch {}
  }, [cart, hydrated]);

  const addItem    = (item)            => dispatch({ type: 'ADD',    item });
  const updateItem = (inventory_id, quantity) => dispatch({ type: 'UPDATE', inventory_id, quantity });
  const removeItem = (inventory_id)    => dispatch({ type: 'REMOVE', inventory_id });
  const clearCart  = ()                => dispatch({ type: 'CLEAR' });

  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const subtotal  = cart.reduce((s, i) => s + (i.discounted_price || i.price || 0) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, itemCount, subtotal, addItem, updateItem, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
