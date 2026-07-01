import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ordersApi from '../api/orders';

// ── Cart Item shape ──────────────────────────────────────────
// {
//   productId:      string,
//   inventoryId:    string,   // shop_inventory row id
//   shopId:         string,
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
      items:  [],
      shopId: null,  // V1: single shop constraint

      // Derived getters
      get quickItems()     { return get().items.filter(i => i.deliveryTier === 'quick'); },
      get scheduledItems() { return get().items.filter(i => i.deliveryTier === 'scheduled'); },
      get itemCount()      { return get().items.reduce((s, i) => s + i.quantity, 0); },
      get isEmpty()        { return get().items.length === 0; },
      get hasBothTiers()   {
        const tiers = new Set(get().items.map(i => i.deliveryTier));
        return tiers.has('quick') && tiers.has('scheduled');
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
      // Updates local state immediately, then syncs to backend in background.
      addItem: (item) => {
        set((state) => {
          const idx = state.items.findIndex(i => i.productId === item.productId);
          if (idx >= 0) {
            const updated = [...state.items];
            updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + (item.quantity || 1) };
            return { items: updated };
          }
          return {
            items:  [...state.items, { ...item, quantity: item.quantity || 1 }],
            shopId: item.shopId,
          };
        });

        // Background API sync (non-blocking)
        ordersApi.addToCart(item.shopId, item.productId, item.quantity || 1)
          .catch((err) => {
            console.warn('[Cart] addToCart sync failed:', err.message);
            // Revert optimistic add on error
            set((state) => ({
              items: state.items.filter(i => i.productId !== item.productId),
            }));
          });
      },

      // ── OPTIMISTIC UPDATE ───────────────────────────────────
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }

        const prev = get().items.find(i => i.productId === productId);
        if (!prev) return;

        set((state) => ({
          items: state.items.map(i =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        }));

        // Find inventory item id for API call
        ordersApi.updateCartItem(prev.cartItemId, quantity).catch((err) => {
          console.warn('[Cart] updateQuantity sync failed:', err.message);
          // Revert
          set((state) => ({
            items: state.items.map(i =>
              i.productId === productId ? { ...i, quantity: prev.quantity } : i
            ),
          }));
        });
      },

      // ── OPTIMISTIC REMOVE ───────────────────────────────────
      removeItem: (productId) => {
        const prev = get().items.find(i => i.productId === productId);
        if (!prev) return;

        set((state) => ({
          items: state.items.filter(i => i.productId !== productId),
        }));

        if (prev.cartItemId) {
          ordersApi.removeCartItem(prev.cartItemId).catch((err) => {
            console.warn('[Cart] removeItem sync failed:', err.message);
            // Revert
            set((state) => ({ items: [...state.items, prev] }));
          });
        }
      },

      // ── CLEAR ────────────────────────────────────────────────
      clearCart: () => {
        set({ items: [], shopId: null });
        ordersApi.clearCart().catch(() => {});
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
            name:           item.products.name,
            imageUrl:       item.products.images?.[0] || null,
            unit:           item.products.unit,
            deliveryTier:   item.products.delivery_tier,
            unitPricePaise: item.shop_inventory.price,
            quantity:       item.quantity,
          }));
          set({ items: serverItems, shopId: serverItems[0]?.shopId || null });
        } catch (e) {
          console.warn('[Cart] Server sync failed (using local cache):', e.message);
        }
      },
    }),
    {
      name:    'tezznirmaan-cart-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist items and shopId — derived state is recomputed
      partialize: (state) => ({ items: state.items, shopId: state.shopId }),
    }
  )
);

export default useCartStore;
