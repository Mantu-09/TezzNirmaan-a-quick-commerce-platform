// ────────────────────────────────────────────────────────────
// Campaign Controller — P8-3
//
// Admin-only endpoints (platform_admin):
//   GET    /admin/campaigns                  — list (paged, filterable)
//   POST   /admin/campaigns                  — create draft
//   GET    /admin/campaigns/:id              — detail + stats
//   PATCH  /admin/campaigns/:id              — update draft/scheduled
//   POST   /admin/campaigns/:id/schedule     — set scheduled_at
//   POST   /admin/campaigns/:id/send-now     — enqueue immediate send
//   POST   /admin/campaigns/:id/cancel       — cancel draft/scheduled
//   GET    /admin/campaigns/preview          — audience size preview
// ────────────────────────────────────────────────────────────
import * as campaignService from '../services/campaign.service.js';
import { enqueueImmediateCampaign } from '../lib/jobQueue.js';
import { ValidationError } from '../utils/errors.js';

// ── List ──────────────────────────────────────────────────────

/**
 * GET /admin/campaigns?status=draft|scheduled|sending|sent|cancelled&page=1&limit=20
 */
export async function listCampaigns(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    const result = await campaignService.getCampaigns({
      status: status || undefined,
      page:   page  ? parseInt(page,  10) : 1,
      limit:  limit ? Math.min(100, parseInt(limit, 10)) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── Create ────────────────────────────────────────────────────

/**
 * POST /admin/campaigns
 * Body: { title, body, image_url?, deep_link?, audience, city_id?, scheduled_at? }
 *
 * If scheduled_at is provided → status becomes 'scheduled'.
 * Otherwise → status is 'draft'.
 */
export async function createCampaign(req, res, next) {
  try {
    const {
      title, body, image_url, deep_link,
      audience, city_id, scheduled_at,
    } = req.body;

    const campaign = await campaignService.createCampaign({
      title, body, image_url, deep_link,
      audience, city_id, scheduled_at,
      created_by: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: campaign.status === 'scheduled'
        ? `Campaign scheduled for ${campaign.scheduled_at}`
        : 'Campaign saved as draft',
      campaign,
    });
  } catch (err) {
    next(err);
  }
}

// ── Detail ────────────────────────────────────────────────────

/**
 * GET /admin/campaigns/:id
 */
export async function getCampaign(req, res, next) {
  try {
    const result = await campaignService.getCampaignDetail(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── Update ────────────────────────────────────────────────────

/**
 * PATCH /admin/campaigns/:id
 * Only draft and scheduled campaigns can be edited.
 */
export async function updateCampaign(req, res, next) {
  try {
    const campaign = await campaignService.updateCampaign(req.params.id, req.body);
    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
}

// ── Schedule ──────────────────────────────────────────────────

/**
 * POST /admin/campaigns/:id/schedule
 * Body: { scheduled_at: ISO datetime string (must be future) }
 */
export async function scheduleCampaign(req, res, next) {
  try {
    const { scheduled_at } = req.body;
    if (!scheduled_at) throw new ValidationError('scheduled_at is required');

    const campaign = await campaignService.scheduleCampaign(req.params.id, scheduled_at);
    res.json({
      success: true,
      message: `Campaign scheduled for ${campaign.scheduled_at}`,
      campaign,
    });
  } catch (err) {
    next(err);
  }
}

// ── Send now ──────────────────────────────────────────────────

/**
 * POST /admin/campaigns/:id/send-now
 * Enqueues an immediate send job via pg-boss.
 * Returns 202 Accepted — actual send happens asynchronously.
 */
export async function sendCampaignNow(req, res, next) {
  try {
    const { id } = req.params;

    // Quick status check — don't enqueue if already sent/sending/cancelled
    const { getCampaignDetail } = await import('../services/campaign.service.js');
    const { campaign } = await getCampaignDetail(id);

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      throw new ValidationError(
        `Cannot send a campaign in '${campaign.status}' status. ` +
        `Only 'draft' and 'scheduled' campaigns can be sent.`
      );
    }

    await enqueueImmediateCampaign(id);

    res.status(202).json({
      success: true,
      message: `Campaign queued for immediate send. Check back in ~30 seconds for delivery stats.`,
      campaign_id: id,
    });
  } catch (err) {
    next(err);
  }
}

// ── Cancel ────────────────────────────────────────────────────

/**
 * POST /admin/campaigns/:id/cancel
 */
export async function cancelCampaign(req, res, next) {
  try {
    const campaign = await campaignService.cancelCampaign(req.params.id);
    res.json({ success: true, message: 'Campaign cancelled', campaign });
  } catch (err) {
    next(err);
  }
}

// ── Audience preview ──────────────────────────────────────────

/**
 * GET /admin/campaigns/preview?audience=all_customers&city_id=<uuid>
 * Returns the estimated recipient count for a given audience segment.
 * Called live as the admin selects audience in the UI.
 */
export async function previewAudience(req, res, next) {
  try {
    const { audience, city_id } = req.query;
    if (!audience) throw new ValidationError('audience query param is required');

    const result = await campaignService.previewAudience(audience, city_id || null);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
