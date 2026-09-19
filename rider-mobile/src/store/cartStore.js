import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ordersApi from '../api/orders';

// ── Cart Item shape ──────────────────────────────────────────
// {
//   cartItemId:     string | undefined,
//   productId:      string,
//   inventoryId:    string,   // shop_inventory row id
//   shopId:         string,
//   shopName:       string,   // for display in grouped cart
//   name:           string,
//   imageUrl:       string | null,
//   unit:           string,   // 'bag', 'piece', 'kg', 'sq.ft', etc.
//   deliveryTier:   'quick' | 'scheduled',
//   unitPricePaise: number,   // always from server, never client-computed
//   quantity:       number,
// }

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      // ── Derived getters ─────────────────────────────────────
      get quickItems()     { return get().items.filter(i => i.deliveryTier === 'quick'); },
      get scheduledItems() { return get().items.filter(i => i.deliveryTier === 'scheduled'); },
      get itemCount()      { return get().items.reduce((s, i) => s + i.quantity, 0); },
      get isEmpty()        { return get().items.length === 0; },

      get hasBothTiers() {
        const tiers = new Set(get().items.map(i => i.deliveryTier));
        return tiers.has('quick') && tiers.has('scheduled');
      },

      // P4-3B: Multi-shop derived state
      get shopIds() {
        return [...new Set(get().items.map(i => i.shopId))];
      },
      get isMultiShop() {
        return get().shopIds.length > 1;
      },
      get itemsByShop() {
        // Returns { [shopId]: { shopName, items, quickItems, scheduledItems } }
        const groups = {};
        for (const item of get().items) {
          if (!groups[item.shopId]) {
            groups[item.shopId] = {
              shopId:         item.shopId,
              shopName:       item.shopName || 'Shop',
              items:          [],
              quickItems:     [],
              scheduledItems: [],
            };
          }
          groups[item.shopId].items.push(item);
          if (item.deliveryTier === 'quick')     groups[item.shopId].quickItems.push(item);
          if (item.deliveryTier === 'scheduled') groups[item.shopId].scheduledItems.push(item);
        }
        return groups;
      },

      totalPaise() {
        return get().items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
      },

      quickSubtotalPaise() {
        return get().quickItems.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
      },

      scheduledSubtotalPaise() {
        return get().scheduledItems.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
      },

      // ── OPTIMISTIC ADD ──────────────────────────────────────
      // P4-3B: Multi-shop carts are now allowed — no single-shop restriction.
      // Items from different shops co-exist in the same cart.
      // Guest-safe: API sync only runs when user is authenticated.
      addItem: (item) => {
        set((state) => {
          const idx = state.items.findIndex(
            i => i.productId === item.productId && i.shopId === item.shopId
          );
          if (idx >= 0) {
            const updated = [...state.items];
            updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + (item.quantity || 1) };
            return { items: updated };
          }
          return {
            items: [...state.items, { ...item, quantity: item.quantity || 1 }],
          };
        });

        // Background API sync — only when authenticated (guests keep local cart)
        const isAuth = require('./authStore').default.getState().isAuthenticated;
        if (!isAuth) return;

        ordersApi.addToCart(item.shopId, item.productId, item.quantity || 1)
          .catch((err) => {
            console.warn('[Cart] addToCart sync failed:', err.message);
            // Revert optimistic add on error
            set((state) => ({
              items: state.items.filter(
                i => !(i.productId === item.productId && i.shopId === item.shopId)
              ),
            }));
          });
      },


      // ── OPTIMISTIC UPDATE ───────────────────────────────────
      updateQuantity: (productId, quantity, shopId) => {
        if (quantity <= 0) {
          get().removeItem(productId, shopId);
          return;
        }

        const prev = get().items.find(
          i => i.productId === productId && (!shopId || i.shopId === shopId)
        );
        if (!prev) return;

        set((state) => ({
          items: state.items.map(i =>
            i.productId === productId && (!shopId || i.shopId === shopId)
              ? { ...i, quantity }
              : i
          ),
        }));

        // Guest-safe: only sync with server when authenticated
        const isAuth = require('./authStore').default.getState().isAuthenticated;
        if (!isAuth) return;

        ordersApi.updateCartItem(prev.cartItemId, quantity).catch((err) => {
          console.warn('[Cart] updateQuantity sync failed:', err.message);
          set((state) => ({
            items: state.items.map(i =>
              i.productId === productId && (!shopId || i.shopId === shopId)
                ? { ...i, quantity: prev.quantity }
                : i
            ),
          }));
        });
      },


      // ── OPTIMISTIC REMOVE ───────────────────────────────────
      removeItem: (productId, shopId) => {
        const prev = get().items.find(
          i => i.productId === productId && (!shopId || i.shopId === shopId)
        );
        if (!prev) return;

        set((state) => ({
          items: state.items.filter(
            i => !(i.productId === productId && (!shopId || i.shopId === shopId))
          ),
        }));

        // Guest-safe: only sync with server when authenticated
        const isAuth = require('./authStore').default.getState().isAuthenticated;
        if (prev.cartItemId && isAuth) {
          ordersApi.removeCartItem(prev.cartItemId).catch((err) => {
            console.warn('[Cart] removeItem sync failed:', err.message);
            set((state) => ({ items: [...state.items, prev] }));
          });
        }
      },

      // ── CLEAR ────────────────────────────────────────────────
      clearCart: () => {
        set({ items: [] });
        const isAuth = require('./authStore').default.getState().isAuthenticated;
        if (isAuth) ordersApi.clearCart().catch(() => {});
      },


      // ── LOAD FROM SERVER ────────────────────────────────────
      // Call on app foreground to sync any server-side changes
      syncFromServer: async () => {
        try {
          const data = await ordersApi.getCart();
          const serverItems = (data?.items || []).map(item => ({
            cartItemId:     item.id,
            productId:      item.products.id,
            inventoryId:    item.shop_inventory.id,
            shopId:         item.shop_id,
            shopName:       item.shop_inventory?.shop?.name || item.shop_name || 'Shop',
            name:           item.products.name,
            imageUrl:       item.products.images?.[0] || null,
            unit:           item.products.unit,
            deliveryTier:   item.products.delivery_tier,
            unitPricePaise: item.shop_inventory.price,
            quantity:       item.quantity,
          }));
          set({ items: serverItems });
        } catch (e) {
          console.warn('[Cart] Server sync failed (using local cache):', e.message);
        }
      },
    }),
    {
      name:    'tezznirmaan-cart-v2', // bumped from v1 — old cart data is discarded on upgrade
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist items — all derived state is recomputed
      partialize: (state) => ({ items: state.items }),
    }
  )
);

export default useCartStore;
