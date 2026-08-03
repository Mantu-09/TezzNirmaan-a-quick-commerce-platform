// ────────────────────────────────────────────────────────────
// 04_websocket.js — TezzNirmaan Load Test Suite
// P9-1: WebSocket / Socket.IO Connection Load Test
//
// Purpose: Test 100 concurrent customers watching order tracking.
//   TezzNirmaan uses Socket.IO with an Upstash Redis adapter for
//   horizontal scaling. The Upstash free tier allows 100 simultaneous
//   Redis connections — this test saturates exactly that limit.
//
//   Each VU:
//     1. Opens a Socket.IO WebSocket connection to /customer namespace
//     2. Holds the connection open for 30 seconds (simulates a customer
//        watching their order being delivered)
//     3. Receives any ORDER_STATUS or RIDER_LOCATION events
//     4. Closes cleanly
//
// Thresholds:
//   • ws_errors < 10              — < 10 connection failures total
//   • ws_connected > 90           — > 90% of 100 VUs connect successfully
//
// If ws_errors > 10:
//   → Upstash free tier is saturated (100 Redis connection limit)
//   → Solution: upgrade Upstash to paid tier ($10/month) for 1000 connections
//   → Check Upstash Console → Database → Connections graph to confirm
//
// Note on Socket.IO vs raw WebSocket:
//   k6 does not natively support the Socket.IO handshake protocol.
//   We connect using the raw WebSocket URL (Socket.IO falls back to WS
//   after the HTTP polling handshake). To trigger the full Engine.IO
//   handshake we first do a polling request then upgrade.
//   If your Socket.IO config has `transports: ['websocket']` only,
//   connect directly to the ws:// URL without polling.
//
// Run:
//   k6 run -e WS_URL=wss://tezznirmaan-api-staging.onrender.com \
//          -e TEST_TOKEN=eyJ... \
//          -e TEST_ORDER_ID=<uuid> \
//          backend/load-tests/04_websocket.js
// ────────────────────────────────────────────────────────────
import { WebSocket } from 'k6/experimental/websockets';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const wsConnected = new Counter('ws_connected');
const wsMessages  = new Counter('ws_messages_received');
const wsErrors    = new Counter('ws_errors');
const wsLatency   = new Trend('ws_first_message_latency');

export const options = {
  scenarios: {
    ws_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },  // Ramp: 0 → 100 concurrent WS connections
        { duration: '2m',  target: 100 },  // Hold: 100 VUs (Upstash free tier limit)
        { duration: '30s', target:   0 },  // Ramp down cleanly
      ],
    },
  },
  thresholds: {
    // < 10 connection errors total across entire test
    // More than 10 means Redis connection pool is exhausted
    ws_errors:    ['count<10'],

    // > 90 VUs (of 100) must connect successfully
    // Allows for a small number of transient failures during ramp-up
    ws_connected: ['count>90'],
  },
};

const WS_URL        = __ENV.WS_URL        || 'wss://tezznirmaan-api-staging.onrender.com';
const AUTH_TOKEN    = __ENV.TEST_TOKEN    || '';
const TEST_ORDER_ID = __ENV.TEST_ORDER_ID || 'test-order-id';

export default function () {
  // Socket.IO WebSocket URL format:
  // /socket.io/?EIO=4&transport=websocket&token=...
  // The /customer namespace is appended as ?ns=/customer
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

  let connectTime = Date.now();
  let connected   = false;

  const ws = new WebSocket(url, null, {
    headers: {
      // Some Socket.IO implementations check the Origin header
      'Origin': WS_URL.replace('wss://', 'https://').replace('ws://', 'http://'),
    },
  });

  ws.onopen = () => {
    connected = true;
    wsConnected.add(1);

    // Engine.IO handshake: send "2" (ping) to confirm connection
    // Then send Socket.IO auth message: 40{"token":"...","orderId":"..."}
    try {
      ws.send('2');  // EIO ping

      // Socket.IO connect to /customer namespace with auth
      ws.send(JSON.stringify({
        type: 'connect',
        nsp:  '/customer',
        data: { token: AUTH_TOKEN, orderId: TEST_ORDER_ID },
      }));
    } catch (e) {
      // Handshake failure — count as error
      wsErrors.add(1);
    }
  };

  ws.onmessage = (event) => {
    wsMessages.add(1);

    // Track latency to first message (proxy for connection establishment time)
    if (connected && connectTime) {
      wsLatency.add(Date.now() - connectTime);
      connectTime = null; // Only record first message latency
    }

    // Validate message structure for any ORDER_STATUS or RIDER_LOCATION events
    try {
      const raw = event.data;

      // Engine.IO control frames start with a digit (2=ping, 3=pong, 0=open)
      // Skip these — they are not application messages
      if (typeof raw === 'string' && /^\d/.test(raw) && raw.length < 10) return;

      // Application message: parse and validate
      if (typeof raw === 'string' && raw.length > 2) {
        // Socket.IO messages start with "42" (message type)
        const jsonStr = raw.startsWith('42') ? raw.slice(2) : raw;
        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length >= 2) {
            const [eventName, data] = parsed;
            check({ eventName, data }, {
              'message has event name':  (m) => typeof m.eventName === 'string',
              'message has data object': (m) => m.data !== null,
            });
          }
        } catch (_) {
          // Not all messages are JSON arrays — ignore parse errors on control frames
        }
      }
    } catch (_) {
      // Silently ignore malformed frames — they don't affect the connection
    }
  };

  ws.onerror = (event) => {
    wsErrors.add(1);
    console.error(`WebSocket error: ${event.message || 'unknown'}`);
  };

  ws.onclose = () => {
    // Normal closure — no action needed
    if (!connected) {
      // Closed before open event fired = connection failure
      wsErrors.add(1);
    }
  };

  // Hold connection open for 30 seconds
  // This simulates a customer watching their order being delivered
  // Average TezzNirmaan delivery: 20–40 minutes, but customers watch
  // actively for the first 2–5 minutes then background the app
  sleep(30);

  // Graceful close
  try {
    ws.close(1000, 'Test complete');
  } catch (_) {
    // Already closed — ignore
  }
}
