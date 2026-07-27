// jest.config.js — TezzNirmaan Backend Test Configuration
// Uses Node's experimental VM modules for native ES module support.
//
// Run:          npm test
// With coverage: npm run test:coverage
// Watch mode:    npm run test:watch
export default {
  testEnvironment: 'node',

  // No transform needed — we use native ESM with --experimental-vm-modules
  transform: {},

  // ESM is handled by "type":"module" in package.json — no need for extensionsToTreatAsEsm

  // Discover test files in src/tests/
  // Note: __tests__/ is the Jest default; we use src/tests/ to keep tests
  // alongside source code in the same monorepo structure.
  testMatch: ['**/src/tests/**/*.test.js'],

  // Abort slow tests — DB operations can be slow on first connect.
  // 30s is conservative; most tests should finish in < 5s.
  testTimeout: 30000,

  // Coverage output directory (consumed by codecov-action in CI)
  coverageDirectory: 'coverage',

  // Collect coverage from source files only (not tests or node_modules)
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/controllers/**/*.js',
    '!src/tests/**',
    '!src/server.js',
  ],

  // Minimum coverage thresholds — intentionally low for the first CI run.
  // Raise these as the test suite matures.
  coverageThreshold: {
    global: {
      lines:      40,
      functions:  35,
      branches:   30,
      statements: 40,
    },
  },

  // Verbose output to make CI logs easy to scan
  verbose: true,

  // ── Module mocks for infrastructure packages ─────────────────
  // pg-boss (CJS) and @upstash/redis (ESM async) both crash Jest's
  // experimental-vm-modules runner. Mock them at the resolver level
  // so tests never actually attempt a DB/Redis connection.
  moduleNameMapper: {
    '^pg-boss$':          '<rootDir>/src/tests/__mocks__/pg-boss.js',
    '^@upstash/redis$':   '<rootDir>/src/tests/__mocks__/upstash-redis.js',
  },

  // Silence open handle warnings for Supabase fetch keep-alive
  openHandlesTimeout: 1000,
};
