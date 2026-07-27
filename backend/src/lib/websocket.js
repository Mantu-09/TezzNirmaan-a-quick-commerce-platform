// ────────────────────────────────────────────────────────────
// WebSocket Server — P6-1: Socket.IO + Redis Adapter
//
// REPLACES: raw `ws` single-instance implementation (P5-1)
//
// WHY Socket.IO + Redis adapter:
//   The previous implementation stored all connections in
//   in-memory Maps (orderSubscriptions, riderConnections).
//   When Render scales to 2+ instances, a rider on Instance A
//   and a customer on Instance B never see each other — the
//   tracking map freezes silently with no errors.
//
//   The Redis pub/sub adapter acts as a shared message bus:
//   each server publishes to Redis, every other instance
//   subscribes and forwards to its local sockets. The result
//   is transparent fan-out across unlimited instances.
//
// Architecture:
//   /customer namespace — customers subscribe to order rooms
//   /rider    namespace — riders broadcast location updates
//
// Redis connection:
//   Uses ioredis (TCP pub/sub) — NOT the existing @upstash/redis
//   REST client. ioredis requires REDIS_URL in rediss:// format.
//   Falls back gracefully to single-instance (no adapter) when
//   REDIS_URL is absent (local dev without Redis).
//
// Message events:
//   RIDER → SERVER:  socket.emit('location_update', { lat, lng, orderId })
//   SERVER → CUSTOMER: socket.emit('RIDER_LOCATION', { lat, lng, timestamp, rider_id })
//                      socket.emit('ORDER_STATUS',   { status, metadata, timestamp })
//   SERVER → SHOP:   socket.emit('NEW_ORDER',        { order_number, total_paise, item_count })
//
// Backward-compatible broadcast exports:
//   broadcastOrderStatus(orderId, status, metadata)
//   broadcastToShop(shopId, event, data)
// ────────────────────────────────────────────────────────────
import { Server }          from 'socket.io';
import { supabaseAdmin }   from '../config/supabase.js';
import logger              from '../utils/logger.js';

let io = null;

// ── Auth middleware factory ───────────────────────────────────
// Verifies the Supabase JWT passed via socket.handshake.auth.token.
// Attaches socket.userId and socket.userRole on success.
function makeAuthMiddleware() {
  return async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) return next(new Error('Invalid or expired token'));
      socket.userId   = user.id;
      socket.userRole = socket.handshake.auth?.role || 'customer';
      next();
    } catch (err) {
      logger.warn('Socket.IO auth failed', { error: err.message });
      next(new Error('Authentication failed'));
    }
  };
}

// ── Redis adapter (optional) ──────────────────────────────────
// If REDIS_URL is set, attach the Redis pub/sub adapter so all
// server instances share the same socket rooms via Redis.
// If not set, fall back to in-process only (works for single-instance dev).
async function attachRedisAdapter(ioServer) {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.warn('Socket.IO: REDIS_URL not set — running single-instance mode (no Redis adapter). ' +
      'Set REDIS_URL=rediss://default:PASS@endpoint.upstash.io:6379 for horizontal scaling.');
    return;
  }

  try {
    // Dynamic import — keeps ioredis optional for dev environments
    const { Redis }          = await import('ioredis');
    const { createAdapter }  = await import('@socket.io/redis-adapter');

    const redisOpts = {
      maxRetriesPerRequest: null,  // Required for pub/sub mode
      enableReadyCheck:     false,
      lazyConnect:          false,
    };

    const pubClient = new Redis(redisUrl, redisOpts);
    const subClient = pubClient.duplicate();

    // Wait for both connections to be ready
    await Promise.all([
      new Promise((resolve, reject) => {
        pubClient.once('ready', resolve);
        pubClient.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        subClient.once('ready', resolve);
        subClient.once('error', reject);
      }),
    ]);

    ioServer.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO: Redis pub/sub adapter connected — horizontal scaling enabled');

    // Prune stale rider_locations every 5 minutes (keep only last 5 min)
    setInterval(async () => {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('rider_locations')
        .delete()
        .lt('recorded_at', cutoff);
      if (error) logger.warn('Socket.IO: rider_locations prune failed', { error: error.message });
    }, 5 * 60 * 1000);

  } catch (err) {
    logger.error('Socket.IO: Redis adapter connection failed — falling back to single-instance mode', {
      error: err.message,
    });
    // Non-fatal: server still works, just not horizontally scaled
  }
}

// ── WebSocket server init ─────────────────────────────────────

/**
 * Initialise Socket.IO on the shared HTTP server.
 * Called once from server.js after the http.Server is created.
 *
 * @param {import('http').Server} httpServer
 * @returns {Promise<import('socket.io').Server>}
 */
export async function initWebSocket(httpServer) {
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:19006'];

  io = new Server(httpServer, {
    cors: {
      origin:      allowedOrigins.includes('*') ? '*' : allowedOrigins,
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    // WebSocket first; polling fallback for mobile clients on poor networks
    transports:   ['websocket', 'polling'],
    pingTimeout:  20000,
    pingInterval: 25000,
    // Compatibility: allow socket.io v2/v3 clients from older mobile builds
    allowEIO3:    true,
  });

  // Attach Redis adapter BEFORE setting up namespaces
  await attachRedisAdapter(io);

  const authMiddleware = makeAuthMiddleware();

  // ── /customer namespace ──────────────────────────────────────
  // Customers connect here and subscribe to a specific order's room.
  // The room name is `order:<orderId>` — shared across all instances.
  const customerNS = io.of('/customer');
  customerNS.use(authMiddleware);

  customerNS.on('connection', async (socket) => {
    const orderId = socket.handshake.query?.orderId;

    if (orderId) {
      // Verify the order belongs to this customer before joining the room
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('id', orderId)
        .eq('customer_id', socket.userId)
        .maybeSingle();

      if (!order) {
        logger.warn('Socket.IO /customer: order ownership check failed', {
          userId: socket.userId, orderId,
        });
        socket.emit('error', { message: 'Order not found or access denied' });
        socket.disconnect(true);
        return;
      }

      await socket.join(`order:${orderId}`);
      logger.info('Socket.IO /customer: joined order room', {
        userId: socket.userId, orderId,
      });

      // Send last-known rider location immediately so the customer
      // doesn't see an empty map while waiting for the rider's next ping
      _sendLastKnownLocation(socket, orderId);
    }

    socket.on('disconnect', (reason) => {
      logger.debug('Socket.IO /customer: disconnected', {
        userId: socket.userId, reason,
      });
    });
  });

  // ── /shop namespace ──────────────────────────────────────────
  // Shop owners connect here to receive new-order alerts in real-time.
  // Rooms are named `shop:<shopId>`.
  // The dashboard uses Supabase Realtime as primary; this is supplemental.
  const shopNS = io.of('/shop');
  shopNS.use(authMiddleware);

  shopNS.on('connection', async (socket) => {
    // Resolve the shop_id for this authenticated user
    const { data: shop } = await supabaseAdmin
      .from('shops')
      .select('id')
      .eq('profile_id', socket.userId)
      .maybeSingle();

    if (shop) {
      await socket.join(`shop:${shop.id}`);
      logger.info('Socket.IO /shop: joined shop room', {
        userId: socket.userId, shopId: shop.id,
      });
    }

    socket.on('disconnect', (reason) => {
      logger.debug('Socket.IO /shop: disconnected', { userId: socket.userId, reason });
    });
  });

  // ── /rider namespace ─────────────────────────────────────────
  // Riders connect here and emit location_update events.
  // The server fans those updates out to the matching order room
  // in /customer namespace — the Redis adapter ensures this reaches
  // all customer instances, not just the current server.
  const riderNS = io.of('/rider');
  riderNS.use(authMiddleware);

  riderNS.on('connection', (socket) => {
    logger.info('Socket.IO /rider: connected', { riderId: socket.userId });

    socket.on('location_update', async ({ lat, lng, orderId }) => {
      // Basic coordinate validation
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      // 1. Persist to DB — fire-and-forget so DB latency never blocks the socket
      supabaseAdmin.from('rider_locations').insert({
        rider_id:    socket.userId,
        lat,
        lng,
        recorded_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) logger.warn('Socket.IO: rider_locations insert failed', { error: error.message });
      });

      // 2. Update riders.current_location for quick REST lookups
      supabaseAdmin.rpc('update_rider_location', {
        p_profile_id: socket.userId,
        p_lng: lng,
        p_lat: lat,
      }).then(({ error }) => {
        if (error && !error.message?.includes('function update_rider_location')) {
          logger.warn('Socket.IO: update_rider_location RPC failed', { error: error.message });
        }
      });

      // 3. Fan-out to the order room in /customer namespace
      // Redis adapter ensures this reaches ALL instances, not just this one
      if (orderId) {
        io.of('/customer').to(`order:${orderId}`).emit('RIDER_LOCATION', {
          lat,
          lng,
          timestamp: Date.now(),
          rider_id:  socket.userId,
        });

        logger.debug('Socket.IO: location broadcast', {
          riderId: socket.userId, orderId,
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket.IO /rider: disconnected', { riderId: socket.userId, reason });
    });
  });

  logger.info('Socket.IO server ready', {
    namespaces:  ['/customer', '/shop', '/rider'],
    redisAdapter: !!process.env.REDIS_URL,
  });

  return io;
}

// ── Exported broadcast helpers ────────────────────────────────
// These maintain the same public API as the previous ws implementation
// so no call-site changes are needed in order-lifecycle.service.js, etc.

/**
 * Broadcast an order status change to all customers watching this order.
 * Works across ALL server instances when Redis adapter is active.
 *
 * Called by order-lifecycle.service.js on every sub_order status transition.
 *
 * @param {string} orderId
 * @param {string} status   — new status string
 * @param {object} metadata — { order_number, sub_order_id, shop_name? }
 */
export function broadcastOrderStatus(orderId, status, metadata = {}) {
  if (!io) return; // Graceful no-op if Socket.IO not yet initialized

  io.of('/customer').to(`order:${orderId}`).emit('ORDER_STATUS', {
    status,
    metadata,
    timestamp: Date.now(),
  });

  logger.debug('Socket.IO: ORDER_STATUS broadcast', { orderId, status });
}

/**
 * Send a real-time event to all shop dashboard connections for a given shop.
 * Used for new-order alerts — supplements Supabase Realtime.
 *
 * Called by order-placement.service.js after a successful order placement.
 *
 * @param {string} shopId
 * @param {string} event  — e.g. 'NEW_ORDER'
 * @param {object} data
 */
export function broadcastToShop(shopId, event, data) {
  if (!io) return;

  io.of('/shop').to(`shop:${shopId}`).emit(event, {
    ...data,
    timestamp: Date.now(),
  });

  logger.debug('Socket.IO: shop broadcast', { shopId, event });
}

/**
 * Returns true if the Socket.IO server is initialized and running.
 */
export function isWebSocketReady() {
  return io !== null;
}

/**
 * Returns connection counts for monitoring (/health endpoint).
 */
export async function getWebSocketStats() {
  if (!io) return { totalConnections: 0, customerSockets: 0, riderSockets: 0, shopSockets: 0 };

  const [customerSockets, riderSockets, shopSockets] = await Promise.all([
    io.of('/customer').fetchSockets(),
    io.of('/rider').fetchSockets(),
    io.of('/shop').fetchSockets(),
  ]);

  return {
    totalConnections: customerSockets.length + riderSockets.length + shopSockets.length,
    customerSockets:  customerSockets.length,
    riderSockets:     riderSockets.length,
    shopSockets:      shopSockets.length,
  };
}

// ── Internal helpers ──────────────────────────────────────────

/**
 * Emit the most recent rider location to a newly connected customer.
 * Prevents an empty map while waiting for the rider's next ping.
 * Fire-and-forget — never throws, non-fatal if it fails.
 */
async function _sendLastKnownLocation(socket, orderId) {
  try {
    // Find the rider assigned to this order
    const { data: assignment } = await supabaseAdmin
      .from('delivery_assignments')
      .select('rider_id')
      .eq('order_id', orderId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (!assignment?.rider_id) return;

    // Get their most recent location ping
    const { data: loc } = await supabaseAdmin
      .from('rider_locations')
      .select('lat, lng, recorded_at')
      .eq('rider_id', assignment.rider_id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!loc) return;

    // Only send if recent (within last 5 minutes)
    const ageMs = Date.now() - new Date(loc.recorded_at).getTime();
    if (ageMs > 5 * 60 * 1000) return;

    socket.emit('RIDER_LOCATION', {
      lat:       loc.lat,
      lng:       loc.lng,
      timestamp: new Date(loc.recorded_at).getTime(),
    });
  } catch {
    // Non-fatal — customer will just wait for the rider's next ping
  }
}
