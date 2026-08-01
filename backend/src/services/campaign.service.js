// ────────────────────────────────────────────────────────────
// Campaign Service — P8-3
//
// Manages the full lifecycle of push notification campaigns:
//   1. resolveAudience()  — build the recipient list for a segment
//   2. previewAudience()  — count recipients without sending (UI preview)
//   3. createCampaign()   — save a draft campaign
//   4. updateCampaign()   — edit a draft
//   5. scheduleCampaign() — mark as scheduled for a future time
//   6. sendCampaign()     — fan-out to Expo, update stats (called by worker)
//   7. cancelCampaign()   — cancel a scheduled campaign
//   8. getCampaigns()     — paginated list with filters
//   9. getCampaignDetail()— detail + per-status recipient counts
//
// Push send strategy:
//   - Uses the existing expo instance from push.service.js via its
//     internal chunked send. Campaign sends call Expo directly here
//     to keep stats tracking (delivered/failed) in one place.
//   - Chunks of 100 messages per Expo API call.
//   - Invalid tokens (DeviceNotRegistered) are cleaned from profiles.
//   - The worker calls sendCampaign() — it is idempotent (checks
//     current status before proceeding).
//
// Audience segments:
//   all_customers          — every profile with a valid push token + role=customer
//   active_last_7_days     — placed ≥1 order in last 7 days
//   inactive_30_plus_days  — no orders in last 30 days (win-back)
//   pass_subscribers       — active TezzPass subscription
//   no_orders_yet          — registered but never ordered (conversion)
//   contractors_only       — verified contractor profiles
//   city_*                 — city_id resolved from campaign.city_id FK
// ────────────────────────────────────────────────────────────
import Expo from 'expo-server-sdk';
import { supabaseAdmin }  from '../config/supabase.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// Reuse same Expo client as push.service.js config
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
  useFcmV1:    true,
});

// ── 1. Audience resolver ──────────────────────────────────────

/**
 * Resolve a campaign_audience value into an array of
 * { id, expo_push_token } objects ready to receive pushes.
 *
 * All queries use supabaseAdmin (service role) — RLS bypassed.
 * Only profiles with a non-null expo_push_token are included.
 * Customers only (role = 'customer').
 *
 * @param {string}      audience  — campaign_audience enum value
 * @param {string|null} cityId    — UUID from push_campaigns.city_id
 * @returns {Promise<{ id: string, expo_push_token: string }[]>}
 */
export async function resolveAudience(audience, cityId = null) {
  // Base: all customers with push tokens
  let baseQuery = supabaseAdmin
    .from('profiles')
    .select('id, expo_push_token')
    .not('expo_push_token', 'is', null)
    .neq('expo_push_token', '')
    .eq('role', 'customer');

  switch (audience) {
    case 'all_customers': {
      const { data } = await baseQuery;
      return data || [];
    }

    case 'active_last_7_days': {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: activeOrders } = await supabaseAdmin
        .from('orders')
        .select('customer_id')
        .gte('created_at', since);
      const ids = [...new Set((activeOrders || []).map(o => o.customer_id))];
      if (!ids.length) return [];
      const { data } = await baseQuery.in('id', ids);
      return data || [];
    }

    case 'inactive_30_plus_days': {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabaseAdmin
        .from('orders')
        .select('customer_id')
        .gte('created_at', since);
      const activeIds = [...new Set((recentOrders || []).map(o => o.customer_id))];
      // Fetch all customers with tokens, then exclude active ones
      const { data: all } = await baseQuery;
      const result = (all || []).filter(u => !activeIds.includes(u.id));
      return result;
    }

    case 'pass_subscribers': {
      const { data: subs } = await supabaseAdmin
        .from('user_subscriptions')
        .select('user_id')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString());
      const ids = [...new Set((subs || []).map(s => s.user_id))];
      if (!ids.length) return [];
      const { data } = await baseQuery.in('id', ids);
      return data || [];
    }

    case 'no_orders_yet': {
      const { data: ordered } = await supabaseAdmin
        .from('orders')
        .select('customer_id');
      const orderedIds = [...new Set((ordered || []).map(o => o.customer_id))];
      const { data: all } = await baseQuery;
      const result = (all || []).filter(u => !orderedIds.includes(u.id));
      return result;
    }

    case 'contractors_only': {
      const { data: contractors } = await supabaseAdmin
        .from('contractor_profiles')
        .select('user_id')
        .eq('is_verified', true);
      const ids = [...new Set((contractors || []).map(c => c.user_id))];
      if (!ids.length) return [];
      // Contractors may not have role='customer' — remove that filter
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, expo_push_token')
        .not('expo_push_token', 'is', null)
        .neq('expo_push_token', '')
        .in('id', ids);
      return data || [];
    }

    // city_patna, city_muzaffarpur, city_bhagalpur, city_gaya — or any city_* value
    default: {
      if (!cityId) {
        logger.warn('campaign: city audience selected but no city_id on campaign', { audience });
        return [];
      }
      // Get all user addresses in this city
      const { data: addrs } = await supabaseAdmin
        .from('addresses')
        .select('user_id')
        .eq('city_id', cityId);
      const ids = [...new Set((addrs || []).map(a => a.user_id))];
      if (!ids.length) return [];
      const { data } = await baseQuery.in('id', ids);
      return data || [];
    }
  }
}

// ── 2. Audience preview ───────────────────────────────────────

/**
 * Count recipients for an audience without sending anything.
 * Used by the campaign creation UI for live preview.
 */
export async function previewAudience(audience, cityId = null) {
  const recipients = await resolveAudience(audience, cityId);
  return { recipient_count: recipients.length };
}

// ── 3. Create draft campaign ──────────────────────────────────

export async function createCampaign({
  title, body, image_url, deep_link,
  audience, city_id, scheduled_at,
  created_by,
}) {
  if (!title?.trim())    throw new ValidationError('title is required (max 65 chars)');
  if (!body?.trim())     throw new ValidationError('body is required (max 110 chars)');
  if (!audience)         throw new ValidationError('audience is required');
  if (!created_by)       throw new ValidationError('created_by is required');

  // Validate city_id is required for city_* audiences
  if (audience.startsWith('city_') && !city_id) {
    throw new ValidationError(`audience '${audience}' requires city_id`);
  }

  const status = scheduled_at ? 'scheduled' : 'draft';

  const { data, error } = await supabaseAdmin
    .from('push_campaigns')
    .insert({
      title:        title.trim(),
      body:         body.trim(),
      image_url:    image_url?.trim() || null,
      deep_link:    deep_link?.trim() || null,
      audience,
      city_id:      city_id || null,
      status,
      scheduled_at: scheduled_at || null,
      created_by,
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to create campaign: ' + error.message, 500);

  logger.info('campaign: created', { id: data.id, audience, status });
  return data;
}

// ── 4. Update draft campaign ──────────────────────────────────

export async function updateCampaign(campaignId, updates) {
  // Only draft campaigns can be edited
  const { data: existing } = await supabaseAdmin
    .from('push_campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (!existing) throw new NotFoundError('Campaign');
  if (!['draft', 'scheduled'].includes(existing.status)) {
    throw new ValidationError(`Cannot edit a campaign in '${existing.status}' status`);
  }

  const allowed = ['title', 'body', 'image_url', 'deep_link', 'audience', 'city_id', 'scheduled_at'];
  const patch = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key];
  }

  if (!Object.keys(patch).length) throw new ValidationError('No valid fields to update');

  // If scheduled_at is being set, promote to scheduled; if cleared, back to draft
  if ('scheduled_at' in patch) {
    patch.status = patch.scheduled_at ? 'scheduled' : 'draft';
  }

  const { data, error } = await supabaseAdmin
    .from('push_campaigns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .select()
    .single();

  if (error) throw new AppError('Failed to update campaign: ' + error.message, 500);
  return data;
}

// ── 5. Schedule campaign ──────────────────────────────────────

export async function scheduleCampaign(campaignId, scheduledAt) {
  if (!scheduledAt) throw new ValidationError('scheduled_at is required');

  const dt = new Date(scheduledAt);
  if (isNaN(dt.getTime())) throw new ValidationError('scheduled_at must be a valid ISO datetime');
  if (dt <= new Date())     throw new ValidationError('scheduled_at must be in the future');

  const { data, error } = await supabaseAdmin
    .from('push_campaigns')
    .update({
      status:       'scheduled',
      scheduled_at: dt.toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id', campaignId)
    .in('status', ['draft', 'scheduled'])
    .select()
    .single();

  if (error || !data) throw new AppError('Campaign not found or already sent/cancelled', 404);
  logger.info('campaign: scheduled', { campaignId, scheduledAt: dt.toISOString() });
  return data;
}

// ── 6. Cancel campaign ────────────────────────────────────────

export async function cancelCampaign(campaignId) {
  const { data, error } = await supabaseAdmin
    .from('push_campaigns')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .in('status', ['draft', 'scheduled'])
    .select()
    .single();

  if (error || !data) throw new AppError('Campaign not found or cannot be cancelled (already sent/sending)', 409);
  logger.info('campaign: cancelled', { campaignId });
  return data;
}

// ── 7. Send campaign (called by pg-boss worker) ───────────────

/**
 * Fan-out push notifications to all resolved recipients.
 * This is the heavy-lifting function — called asynchronously by Worker 14.
 *
 * Idempotency: checks campaign.status before proceeding.
 * If status is already 'sent' or 'cancelled', returns immediately.
 *
 * @param {string} campaignId
 */
export async function sendCampaign(campaignId) {
  // Load campaign
  const { data: campaign, error: fetchErr } = await supabaseAdmin
    .from('push_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (fetchErr || !campaign) {
    logger.error('campaign: not found', { campaignId });
    return;
  }

  // Idempotency guard
  if (['sent', 'cancelled', 'sending'].includes(campaign.status)) {
    logger.info('campaign: already processed — skipping', { campaignId, status: campaign.status });
    return;
  }

  // Mark as sending immediately to prevent duplicate sends
  await supabaseAdmin
    .from('push_campaigns')
    .update({ status: 'sending', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  // Resolve recipients
  const recipients = await resolveAudience(campaign.audience, campaign.city_id);

  logger.info('campaign: starting send', {
    campaignId,
    audience:   campaign.audience,
    recipients: recipients.length,
  });

  if (recipients.length === 0) {
    await supabaseAdmin
      .from('push_campaigns')
      .update({ status: 'sent', total_recipients: 0, updated_at: new Date().toISOString() })
      .eq('id', campaignId);
    logger.info('campaign: 0 recipients — marked sent', { campaignId });
    return;
  }

  // Filter to valid Expo push tokens only
  const validRecipients = recipients.filter(u => Expo.isExpoPushToken(u.expo_push_token));
  const invalidCount    = recipients.length - validRecipients.length;

  if (invalidCount > 0) {
    logger.warn('campaign: invalid tokens skipped', { campaignId, invalidCount });
  }

  // Insert recipient rows in batches (Supabase upsert limit ~1000/call)
  const BATCH = 500;
  for (let i = 0; i < validRecipients.length; i += BATCH) {
    const slice = validRecipients.slice(i, i + BATCH);
    await supabaseAdmin.from('campaign_recipients').insert(
      slice.map(u => ({
        campaign_id:     campaignId,
        user_id:         u.id,
        expo_push_token: u.expo_push_token,
        status:          'pending',
      }))
    );
  }

  // Build Expo messages
  const messages = validRecipients.map(user => ({
    to:        user.expo_push_token,
    sound:     'default',
    title:     campaign.title,
    body:      campaign.body,
    channelId: 'general',
    data: {
      type:        'campaign',
      campaign_id: campaignId,
      deep_link:   campaign.deep_link || null,
    },
    ...(campaign.image_url ? { image: campaign.image_url } : {}),
  }));

  // Chunk and send (Expo max 100 per request)
  const chunks = expo.chunkPushNotifications(messages);
  let deliveredCount = 0;
  let failedCount    = 0;
  const invalidTokens = [];

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const token  = chunk[i]?.to;

        if (ticket.status === 'ok') {
          deliveredCount++;
        } else {
          failedCount++;
          const errCode = ticket.details?.error;

          if (errCode === 'DeviceNotRegistered' && token) {
            invalidTokens.push(token);
          }

          logger.warn('campaign: push ticket error', {
            campaignId,
            token:   token?.slice(-8),
            error:   ticket.message,
            code:    errCode,
          });
        }
      }
    } catch (chunkErr) {
      failedCount += chunk.length;
      logger.error('campaign: chunk send error', {
        campaignId,
        chunkSize: chunk.length,
        error:     chunkErr.message,
      });
    }
  }

  // Clean up stale push tokens (DeviceNotRegistered) in bulk
  if (invalidTokens.length > 0) {
    logger.info('campaign: clearing stale tokens', { count: invalidTokens.length });
    await supabaseAdmin
      .from('profiles')
      .update({ expo_push_token: null })
      .in('expo_push_token', invalidTokens);
  }

  // Final stats update
  await supabaseAdmin
    .from('push_campaigns')
    .update({
      status:          'sent',
      total_recipients: validRecipients.length,
      delivered_count: deliveredCount,
      failed_count:    failedCount,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', campaignId);

  logger.info('campaign: send complete', {
    campaignId,
    total:     validRecipients.length,
    delivered: deliveredCount,
    failed:    failedCount,
  });
}

// ── 8. Admin list + filters ───────────────────────────────────

/**
 * GET /admin/campaigns
 * Paginated list with optional status filter.
 */
export async function getCampaigns({ status, page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from('push_campaigns')
    .select(`
      id, title, audience, status, scheduled_at, sent_at,
      total_recipients, delivered_count, failed_count, opened_count,
      created_at,
      profiles!created_by(id, full_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    campaigns:  data || [],
    pagination: { page: +page, limit: +limit, total: count },
  };
}

// ── 9. Campaign detail ────────────────────────────────────────

/**
 * GET /admin/campaigns/:id
 * Full campaign detail with recipient status breakdown.
 */
export async function getCampaignDetail(campaignId) {
  const { data: campaign, error } = await supabaseAdmin
    .from('push_campaigns')
    .select(`
      *,
      profiles!created_by(id, full_name, phone)
    `)
    .eq('id', campaignId)
    .single();

  if (error || !campaign) throw new NotFoundError('Campaign');

  // Recipient status breakdown
  const { data: breakdown } = await supabaseAdmin
    .from('campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId);

  const counts = { pending: 0, delivered: 0, failed: 0, opened: 0 };
  for (const r of (breakdown || [])) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  // Delivery rate
  const total = campaign.total_recipients || 0;
  const rates = total > 0 ? {
    delivery_rate: ((campaign.delivered_count / total) * 100).toFixed(1),
    failure_rate:  ((campaign.failed_count   / total) * 100).toFixed(1),
    open_rate:     ((campaign.opened_count   / total) * 100).toFixed(1),
  } : { delivery_rate: '0.0', failure_rate: '0.0', open_rate: '0.0' };

  return { campaign, recipient_counts: counts, rates };
}
