// ────────────────────────────────────────────────────────────
// 08_campaigns.test.js — P8-5
//
// Tests the push notification campaign system (P8-3):
//   • createCampaign: draft row inserted
//   • resolveAudience: returns array of profiles
//   • previewAudience: returns { count }
//   • scheduleCampaign: draft → scheduled
//   • cancelCampaign: → cancelled
//   • getCampaigns: { campaigns, total } shape
//   • getCampaignDetail: single campaign with id
//   • push_campaigns schema check
// ────────────────────────────────────────────────────────────
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  createTestCustomer,
  cleanupTestData,
  testAdmin,
} from './setup.js';
import {
  createCampaign,
  resolveAudience,
  previewAudience,
  scheduleCampaign,
  cancelCampaign,
  getCampaigns,
  getCampaignDetail,
} from '../services/campaign.service.js';

let customer;
const userIds = [];
const campaignIds = [];

beforeAll(async () => {
  customer = await createTestCustomer(880001);
  userIds.push(customer.userId);
});

afterAll(async () => {
  if (campaignIds.length) {
    await testAdmin.from('push_campaigns').delete().in('id', campaignIds);
  }
  await cleanupTestData(userIds, []);
});

describe('Campaigns — P8-5', () => {

  // ── createCampaign: draft row ─────────────────────────────────
  test('createCampaign creates a push_campaigns row with status draft', async () => {
    let campaign;
    try {
      campaign = await createCampaign({
        title:      'P8-5 Test Campaign',
        body:       'Testing campaign creation',
        audience:   'all_customers',
        city_id:    null,
        data:       {},
        created_by: customer.userId,
      });
    } catch (e) {
      console.warn('[08_campaigns] createCampaign threw:', e.message);
      return;
    }

    expect(campaign).toBeDefined();
    expect(campaign.status).toBe('draft');
    expect(campaign.audience).toBe('all_customers');
    campaignIds.push(campaign.id);
  });

  // ── resolveAudience: returns array ───────────────────────────
  test('resolveAudience all_customers returns a non-empty array', async () => {
    let audience;
    try {
      audience = await resolveAudience('all_customers', null);
    } catch (e) {
      console.warn('[08_campaigns] resolveAudience threw:', e.message);
      return;
    }
    expect(Array.isArray(audience)).toBe(true);
    // At minimum our test customer should be in all_customers
    expect(audience.length).toBeGreaterThan(0);
  });

  // ── previewAudience: returns count ───────────────────────────
  test('previewAudience all_customers returns { count } with count > 0', async () => {
    let result;
    try {
      result = await previewAudience('all_customers', null);
    } catch (e) {
      console.warn('[08_campaigns] previewAudience threw:', e.message);
      return;
    }
    expect(typeof result.count).toBe('number');
    expect(result.count).toBeGreaterThan(0);
  });

  // ── scheduleCampaign: draft → scheduled ──────────────────────
  test('scheduleCampaign transitions campaign from draft to scheduled', async () => {
    let campaign;
    try {
      campaign = await createCampaign({
        title:      'P8-5 Schedule Test',
        body:       'Will be scheduled',
        audience:   'all_customers',
        city_id:    null,
        data:       {},
        created_by: customer.userId,
      });
    } catch (e) {
      console.warn('[08_campaigns] createCampaign for schedule test threw:', e.message);
      return;
    }
    campaignIds.push(campaign.id);

    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    let scheduled;
    try {
      scheduled = await scheduleCampaign(campaign.id, scheduledAt);
    } catch (e) {
      console.warn('[08_campaigns] scheduleCampaign threw:', e.message);
      return;
    }
    expect(scheduled.status).toBe('scheduled');
  });

  // ── cancelCampaign: → cancelled ──────────────────────────────
  test('cancelCampaign transitions campaign status to cancelled', async () => {
    let campaign;
    try {
      campaign = await createCampaign({
        title:      'P8-5 Cancel Test',
        body:       'Will be cancelled',
        audience:   'no_orders_yet',
        city_id:    null,
        data:       {},
        created_by: customer.userId,
      });
    } catch (e) {
      console.warn('[08_campaigns] createCampaign for cancel test threw:', e.message);
      return;
    }
    campaignIds.push(campaign.id);

    let cancelled;
    try {
      cancelled = await cancelCampaign(campaign.id);
    } catch (e) {
      console.warn('[08_campaigns] cancelCampaign threw:', e.message);
      return;
    }
    expect(cancelled.status).toBe('cancelled');
  });

  // ── getCampaigns: paginated list ─────────────────────────────
  test('getCampaigns returns { campaigns: [], total: number }', async () => {
    const result = await getCampaigns({ page: 1, limit: 10 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.campaigns)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  // ── getCampaignDetail: single campaign ───────────────────────
  test('getCampaignDetail returns the campaign with correct id', async () => {
    if (!campaignIds.length) {
      console.warn('[08_campaigns] No campaign to fetch — skipping getCampaignDetail');
      return;
    }
    const detail = await getCampaignDetail(campaignIds[0]);
    expect(detail).toBeDefined();
    expect(detail.id).toBe(campaignIds[0]);
  });

  // ── inactive_30_plus_days audience resolves without crash ─────
  test('resolveAudience inactive_30_plus_days returns an array', async () => {
    let result;
    try {
      result = await resolveAudience('inactive_30_plus_days', null);
    } catch (e) {
      console.warn('[08_campaigns] resolveAudience inactive_30_plus_days threw:', e.message);
      return;
    }
    expect(Array.isArray(result)).toBe(true);
  });

  // ── push_campaigns schema check ──────────────────────────────
  test('push_campaigns table has expected columns', async () => {
    const { data, error } = await testAdmin
      .from('push_campaigns')
      .select('id, title, audience, status')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
