// __mocks__/upstash-redis.js
// Stateful Jest mock for @upstash/redis.
// Uses an in-memory Map so incr() actually increments across calls —
// required for the OTP rate-limit test (TC-9) to work correctly.

const store = new Map(); // key → { value, expiresAt }

function getEntry(key) {
  const e = store.get(key);
  if (!e) return null;
  if (e.expiresAt && Date.now() > e.expiresAt) { store.delete(key); return null; }
  return e;
}

export class Redis {
  constructor() {}

  async get(key) {
    return getEntry(key)?.value ?? null;
  }

  async set(key, value, opts = {}) {
    const expiresAt = opts.ex ? Date.now() + opts.ex * 1000 : null;
    store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key) {
    return store.delete(key) ? 1 : 0;
  }

  async incr(key) {
    const e = getEntry(key);
    const current = typeof e?.value === 'number' ? e.value : 0;
    const next = current + 1;
    store.set(key, { value: next, expiresAt: e?.expiresAt ?? null });
    return next;
  }

  async expire(key, seconds) {
    const e = getEntry(key);
    if (!e) return 0;
    store.set(key, { ...e, expiresAt: Date.now() + seconds * 1000 });
    return 1;
  }

  async ttl(key) {
    const e = getEntry(key);
    if (!e || !e.expiresAt) return -1;
    return Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 1000));
  }

  async exists(key) { return getEntry(key) ? 1 : 0; }
  async hget(key, field) { return getEntry(key)?.value?.[field] ?? null; }
  async hset(key, data) {
    const e = getEntry(key) ?? { value: {}, expiresAt: null };
    store.set(key, { ...e, value: { ...e.value, ...data } });
    return 1;
  }
  async hgetall(key) { return getEntry(key)?.value ?? {}; }
  async ping() { return 'PONG'; }

  pipeline() {
    const cmds = [];
    const pipe = {
      set:  (...a) => { cmds.push(['set', ...a]); return pipe; },
      get:  (...a) => { cmds.push(['get', ...a]); return pipe; },
      del:  (...a) => { cmds.push(['del', ...a]); return pipe; },
      exec: async () => cmds.map(() => 'OK'),
    };
    return pipe;
  }
}

// Expose store reset for test teardown if needed
export function __resetStore() { store.clear(); }

export default { Redis };
