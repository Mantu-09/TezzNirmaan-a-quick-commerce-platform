import { create } from 'zustand';
import { getStoredSession, signOut as apiSignOut } from '../api/auth';

const useAuthStore = create((set, get) => ({
  user:          null,   // { id, role, phone, email?, setup_complete?, shop_name?, ... }
  token:         null,
  isLoading:     true,   // true during boot session restore
  isAuthenticated: false,

  // Called once on App mount to restore persisted session
  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const session = await getStoredSession();
      if (session?.token && session?.user) {
        set({ user: session.user, token: session.token, isAuthenticated: true });
      }
    } catch (e) {
      console.warn('[Auth] Session restore failed:', e.message);
    } finally {
      set({ isLoading: false });
    }
  },

  // Called after successful OTP verify
  setSession: (user, token) => {
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  // Partially update user in store (e.g. after onboarding completes)
  updateUser: (patch) =>
    set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user })),

  // Sign out — clears state and SecureStore (via apiSignOut)
  signOut: async () => {
    await apiSignOut();
    set({ user: null, token: null, isAuthenticated: false });
  },

  // Called when API returns 401 (token expired)
  onTokenExpired: async () => {
    await apiSignOut();
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
