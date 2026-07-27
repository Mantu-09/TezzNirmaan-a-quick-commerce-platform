// __mocks__/pg-boss.js
// Jest mock for pg-boss — prevents CJS require() crash in ESM test runner.
// All methods are no-ops / resolved Promises so callers degrade gracefully.

class PgBoss {
  constructor() {}
  async start() { return this; }
  async stop() {}
  async work() {}
  async send() { return 'mock-job-id'; }
  async publish() { return 'mock-job-id'; }
  async schedule() {}
  async cancel() {}
  async fetch() { return null; }
  async complete() {}
  async fail() {}
  on() { return this; }
  off() { return this; }
}

export { PgBoss };
export default { PgBoss };
