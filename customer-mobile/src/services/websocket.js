// ────────────────────────────────────────────────────────────
// TezzSocketClient — P6-1: Socket.IO Client
//
// REPLACES: raw WebSocket client (P5-1)
//
// Why Socket.IO:
//   • Automatic polling fallback on poor/mobile networks (no
//     silent freeze when WebSocket is blocked by a proxy)
//   • Built-in room management on the server (no manual Map)
//   • Official Redis adapter handles multi-instance fan-out
//
// Two namespaces:
//   /customer — OrderTrackingScreen subscribes to order updates
//   /rider    — RiderRouteScreen sends location pings
//
// Public API (backward-compatible with the old TezzWebSocket):
//
//   Customer usage (OrderTrackingScreen):
//     wsClient.connect(token, 'customer', orderId)
//     const unsub = wsClient.on('RIDER_LOCATION', ({ lat, lng }) => ...)
//     const unsub = wsClient.on('ORDER_STATUS',   ({ status }) => ...)
//     wsClient.disconnect()
//
//   Rider usage (RiderRouteScreen):
//     wsClient.connect(token, 'rider', userId)
//     wsClient.send({ lat, lng, orderId })
//     wsClient.disconnect()
//
// Auth: JWT passed via socket.handshake.auth.token (no ?token= query
//   param needed — Socket.IO handshake supports auth object natively).
// ────────────────────────────────────────────────────────────
import { io } from 'socket.io-client';

const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ||
  'wss://tezznirmaan-api.onrender.com';

class TezzSocketClient {
  constructor() {
    this._socket    = null;  // active socket (customer or rider namespace)
    this._listeners = new Map(); // event → Set<callback>  (mirrors old API)
    this._role      = null;
  }

  // ── connect ────────────────────────────────────────────────
  /**
   * Connect to the appropriate Socket.IO namespace.
   * Mirrors the old wsClient.connect(token, role, id) signature exactly.
   *
   * @param {string} token  — Supabase JWT
   * @param {'customer'|'rider'} role
   * @param {string} id     — orderId (customer) | userId (rider, ignored server-side)
   */
  connect(token, role, id) {
    // Disconnect any existing socket before creating a new one
    this._cleanup();
    this._role = role;

    const namespace = role === 'rider' ? '/rider' : '/customer';
    const query     = role === 'customer' && id ? { orderId: id } : {};

    this._socket = io(`${WS_URL}${namespace}`, {
      auth:     { token, role },
      query,
      // Force WebSocket on mobile — polling adds latency; fallback is
      // still available via Socket.IO's automatic downgrade on connect_error
      transports:              ['websocket', 'polling'],
      reconnection:            true,
      reconnectionAttempts:    10,
      reconnectionDelay:       1000,
      reconnectionDelayMax:    30000,
      randomizationFactor:     0.5,
    });

    // ── Map Socket.IO events → internal event emitter ────────
    this._socket.on('connect', () => {
      this._emit('connected');
    });

    this._socket.on('disconnect', (reason) => {
      this._emit('disconnected', { reason });
    });

    this._socket.on('connect_error', (err) => {
      // Auth errors (e.g. invalid token) — don't keep retrying
      if (err.message === 'Authentication required' ||
          err.message === 'Invalid or expired token' ||
          err.message === 'Authentication failed') {
        console.warn('[WS] Auth error — disconnecting:', err.message);
        this._socket.disconnect();
      }
      this._emit('error', { message: err.message });
    });

    // Forward server-pushed events to listeners
    this._socket.on('RIDER_LOCATION', (data) => this._emit('RIDER_LOCATION', data));
    this._socket.on('ORDER_STATUS',   (data) => this._emit('ORDER_STATUS',   data));
    this._socket.on('NEW_ORDER',      (data) => this._emit('NEW_ORDER',      data));

    this._socket.on('reconnect', (attempt) => {
      this._emit('reconnecting', { attempt });
    });

    this._socket.on('reconnect_failed', () => {
      console.warn('[WS] Max reconnect attempts reached — giving up');
      this._emit('reconnect_failed');
    });
  }

  // ── send ───────────────────────────────────────────────────
  /**
   * Send a rider location update.
   * Mirrors the old wsClient.send({ lat, lng, orderId }) signature.
   * Safe to call even when not connected — silently dropped.
   *
   * @param {{ lat: number, lng: number, orderId?: string }} data
   */
  send(data) {
    if (this._socket?.connected) {
      this._socket.emit('location_update', data);
    }
  }

  // ── on ─────────────────────────────────────────────────────
  /**
   * Subscribe to a named event.
   * Returns an unsubscribe function — call it in useEffect cleanup.
   * Mirrors the old wsClient.on(event, callback) signature exactly.
   *
   * @param {string}   event    — 'RIDER_LOCATION', 'ORDER_STATUS', 'connected', 'disconnected', 'error'
   * @param {function} callback
   * @returns {function} unsubscribe
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    return () => {
      this._listeners.get(event)?.delete(callback);
    };
  }

  // ── disconnect ─────────────────────────────────────────────
  /**
   * Cleanly disconnect the socket.
   * Mirrors the old wsClient.disconnect() signature.
   */
  disconnect() {
    this._cleanup();
  }

  // ── isConnected ────────────────────────────────────────────
  get isConnected() {
    return this._socket?.connected === true;
  }

  // ── Private ────────────────────────────────────────────────
  _emit(event, data) {
    this._listeners.get(event)?.forEach((cb) => {
      try { cb(data); } catch (err) {
        console.error(`[WS] Listener error (${event}):`, err);
      }
    });
  }

  _cleanup() {
    if (this._socket) {
      this._socket.removeAllListeners();
      this._socket.disconnect();
      this._socket = null;
    }
  }
}

// Singleton — shared across all screens, one connection at a time.
export const wsClient = new TezzSocketClient();
