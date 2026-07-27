// ────────────────────────────────────────────────────────────
// tests/wallet.test.js — P6-2A: Wallet & Payments
//
// Tests the wallet service's atomic Postgres RPC operations
// and the account-erasure endpoint.
//
// Why direct service calls (not HTTP)?
//   The wallet's correctness guarantee is in the DB RPCs:
//   credit_wallet and debit_wallet use FOR UPDATE locking.
//   Testing this through HTTP would add noise from controller
//   auth/validation layers, obscuring the DB-level invariants.
//   We test the HTTP layer for account erasure since it has a
//   meaningful HTTP contract (confirmation string required).
//
// Supabase RPCs tested:
//   credit_wallet(p_user_id, p_amount, p_type, p_description, ...)
//   debit_wallet(p_user_id, p_amount, p_order_id)
// ────────────────────────────────────────────────────────────
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import {
  createTestCustomer,
  cleanupTestData,
  testAdmin,
} from './setup.js';

// Import wallet service directly for atomic RPC tests
import {
  creditWallet,
  debitWallet,
  getWallet,
  refundToWallet,
} from '../services/wallet.service.js';

let customer1, customer2;
const createdUserIds = [];

beforeAll(async () => {
  [customer1, customer2] = await Promise.all([
    createTestCustomer(1001001),
    createTestCustomer(1001002),
  ]);
  createdUserIds.push(customer1.userId, customer2.userId);
});

afterAll(async () => {
  await cleanupTestData(createdUserIds, []);
});

// ── getWallet — zero balance for fresh user ───────────────────

describe('getWallet', () => {
  it('returns 0 balance for a user with no wallet row yet', async () => {
    const wallet = await getWallet(customer2.userId);
    // getWallet creates no row on read — returns zero balance object
    expect(wallet.balance_paise).toBe(0);
    expect(wallet.lifetime_earned_paise).toBe(0);
    expect(wallet.transactions).toEqual([]);
  });
});

// ── creditWallet — atomic balance increase ────────────────────

describe('creditWallet', () => {
  it('increases balance atomically via credit_wallet RPC', async () => {
    // credit_wallet RPC creates the wallet row if it doesn't exist
    await creditWallet(
      customer1.userId,
      50000,           // ₹500
      'credit_cashback',
      'Test cashback credit',
      null,
      null
    );

    const wallet = await getWallet(customer1.userId);
    expect(wallet.balance_paise).toBeGreaterThanOrEqual(50000);
    expect(wallet.lifetime_earned_paise).toBeGreaterThanOrEqual(50000);
  });

  it('throws if credit amount is zero or negative', async () => {
    await expect(
      creditWallet(customer1.userId, 0, 'credit_cashback', 'bad amount')
    ).rejects.toThrow('Credit amount must be positive');

    await expect(
      creditWallet(customer1.userId, -100, 'credit_cashback', 'bad amount')
    ).rejects.toThrow('Credit amount must be positive');
  });
});

// ── debitWallet — atomic balance decrease ────────────────────

describe('debitWallet', () => {
  it('decreases balance via debit_wallet RPC', async () => {
    // First credit so there's something to debit
    await creditWallet(customer1.userId, 20000, 'credit_cashback', 'Pre-debit credit');
    const before = await getWallet(customer1.userId);

    await debitWallet(customer1.userId, 10000, randomUUID());

    const after = await getWallet(customer1.userId);
    expect(after.balance_paise).toBe(before.balance_paise - 10000);
  });

  it('throws INSUFFICIENT_BALANCE when wallet has less than requested amount', async () => {
    // customer2 has no wallet / zero balance — debit should fail
    await expect(
      debitWallet(customer2.userId, 100000, randomUUID())
    ).rejects.toThrow(/Insufficient wallet balance|INSUFFICIENT_BALANCE|Wallet not found/i);
  });

  it('throws if debit amount is zero or negative', async () => {
    await expect(
      debitWallet(customer1.userId, 0, randomUUID())
    ).rejects.toThrow('Debit amount must be positive');
  });
});

// ── refundToWallet ────────────────────────────────────────────

describe('refundToWallet', () => {
  it('credits balance with type credit_refund', async () => {
    const before = await getWallet(customer1.userId);

    const testRefundOrderId = randomUUID();
    await refundToWallet(customer1.userId, 5000, testRefundOrderId, 'TN-240101-0001');

    const after = await getWallet(customer1.userId);
    // Balance must have increased by exactly 5000
    expect(after.balance_paise).toBe(before.balance_paise + 5000);

    // The transaction type must be credit_refund
    const refundTxn = after.transactions.find(
      t => t.type === 'credit_refund' && t.reference_id === testRefundOrderId
    );
    expect(refundTxn).toBeDefined();
    expect(refundTxn.amount_paise).toBe(5000);
  });
});

// ── GET /wallet (HTTP) ────────────────────────────────────────

describe('GET /api/v1/wallet', () => {
  it('returns balance and transactions for authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${customer1.token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('balance_paise');
    expect(typeof res.body.data.balance_paise).toBe('number');
    expect(Array.isArray(res.body.data.transactions)).toBe(true);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/wallet');
    expect(res.status).toBe(401);
  });
});

// ── DELETE /account — erasure endpoint (HTTP) ─────────────────

describe('DELETE /api/v1/account', () => {
  it('returns 400 if confirmation string is wrong', async () => {
    const res = await request(app)
      .delete('/api/v1/account')
      .set('Authorization', `Bearer ${customer1.token}`)
      .send({ confirmation: 'yes please' }); // wrong string
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('INVALID_CONFIRMATION');
  });

  it('returns 400 if confirmation is missing', async () => {
    const res = await request(app)
      .delete('/api/v1/account')
      .set('Authorization', `Bearer ${customer1.token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // NOTE: We do NOT test the happy path (DELETE MY ACCOUNT) here
  // because it would delete customer1 and break later tests in this file.
  // The account erasure service is tested in isolation in setup.js cleanup.
});
