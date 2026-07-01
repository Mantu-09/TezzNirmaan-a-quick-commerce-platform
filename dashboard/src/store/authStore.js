'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';

function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

const useAuthStore = create(
  persist(
    (set) => ({
      user:   null,
      token:  null,
      shopId: null,
      role:   null,

      setSession: (user, token) => {
        const payload = decodeJwt(token);
        const shopId  = user?.shop_id || payload?.shop_id || null;
        const role    = user?.role    || payload?.role    || null;

        // Persist token in cookie for middleware (httpOnly not possible from client)
        Cookies.set('tn_token',   token,  { expires: 7, sameSite: 'strict' });
        Cookies.set('tn_shop_id', shopId, { expires: 7, sameSite: 'strict' });

        set({ user, token, shopId, role });
      },

      clearSession: () => {
        Cookies.remove('tn_token');
        Cookies.remove('tn_shop_id');
        set({ user: null, token: null, shopId: null, role: null });
      },
    }),
    {
      name:    'tn-dashboard-auth',
      partialize: (s) => ({ user: s.user, token: s.token, shopId: s.shopId, role: s.role }),
    }
  )
);

export default useAuthStore;
