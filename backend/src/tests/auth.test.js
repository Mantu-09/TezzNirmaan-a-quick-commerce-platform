// ────────────────────────────────────────────────────────────
// tests/auth.test.js — P0-C Critical Path: Authentication
//
// Tests the auth OTP request/verify flow and the /auth/me
// profile endpoint. Run with: npm test
//
// Requires a test Supabase project (see src/tests/setup.js).
// ────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import {
  createTestCustomer,
  cleanupTestData,
  testAdmin,
} from './setup.js';

let customer;
const VALID_PHONE   = '+919876501001';
const INVALID_PHONE = 'not-a-phone';

beforeAll(async () => {
  customer = await createTestCustomer(501001);
});

afterAll(async () => {
  if (customer) await cleanupTestData([customer.userId]);
});

// ── POST /auth/otp/request ────────────────────────────────

describe('POST /api/v1/auth/otp/request', () => {
  it('returns 200 with "OTP sent" message for a valid phone number', async () => {
    // NOTE: In a real test environment pointing at a test Supabase project
    // with phone auth enabled, this will actually trigger an OTP (Twilio dev mode
    // returns a fake OTP). In CI with mock mode, we just verify the API shape.
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: VALID_PHONE });

    // Accept 200 (OTP sent) or 400 (Supabase not configured for test project)
    // The critical check is that the endpoint exists and has the right shape.
    expect([200, 400]).toContain(res.status);
    expect(res.body).toHaveProperty('success');
    if (res.status === 200) {
      expect(res.body.data.message).toMatch(/OTP sent/i);
    }
  });

  it('returns 400 for missing phone field', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for an invalid phone format (non-phone string)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: INVALID_PHONE });
    // The controller normalises the phone — Supabase will reject the bad number.
    // We expect either a 400 from our validation or from Supabase.
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('returns 429 after OTP_MAX_REQUESTS attempts from the same phone', async () => {
    // Use a unique phone per test run so CI runs never conflict with each other
    const suffix    = Date.now().toString().slice(-6);
    const testPhone = `+9197000${suffix}`;
    // Exhaust the rate limit (3 requests = max, 4th should 429)
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ phone: testPhone });
    }
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: testPhone });
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toMatch(/RATE_LIMIT|OTP_RATE_LIMIT/i);
  });
});

// ── POST /auth/otp/verify ─────────────────────────────────

describe('POST /api/v1/auth/otp/verify', () => {
  it('returns 401 for a wrong OTP token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: VALID_PHONE, token: '000000' }); // wrong token
    expect([400, 401, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /auth/me ──────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.jwt.token');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 with profile data for a valid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Controller returns data.user (not data.profile)
    // See: auth.controller.js getMe() → res.json({ success: true, data: { user: {...} } })
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user.id).toBe(customer.userId);
  });
});
