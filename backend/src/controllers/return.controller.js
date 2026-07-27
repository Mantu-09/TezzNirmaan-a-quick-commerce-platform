// ────────────────────────────────────────────────────────────
// Return Controller — P6-3
//
// Customer endpoints:
//   POST   /customer/orders/sub/:subOrderId/return  → requestReturn
//   GET    /customer/returns                         → listCustomerReturns
//   GET    /customer/returns/:returnId               → getCustomerReturn
//   GET    /customer/orders/sub/:subOrderId/return-eligibility → checkEligibility
//
// Shop endpoints:
//   GET    /shop/returns                             → listShopReturns
//   GET    /shop/returns/:returnId                   → getShopReturn
//   PATCH  /shop/returns/:returnId/approve           → approveReturn
//   PATCH  /shop/returns/:returnId/reject            → rejectReturn
// ────────────────────────────────────────────────────────────
import * as returnService from '../services/return.service.js';
import logger from '../utils/logger.js';

// ── Customer controllers ──────────────────────────────────────

export async function requestReturn(req, res, next) {
  try {
    const { subOrderId } = req.params;
    const userId = req.user.id;
    const { reason, description, photoUrls } = req.body;

    const returnReq = await returnService.requestReturn(userId, {
      subOrderId,
      reason,
      description,
      photoUrls,
    });

    res.status(201).json({ success: true, data: { return: returnReq } });
  } catch (err) {
    next(err);
  }
}

export async function listCustomerReturns(req, res, next) {
  try {
    const returns = await returnService.getCustomerReturns(req.user.id);
    res.json({ success: true, data: { returns } });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerReturn(req, res, next) {
  try {
    const returnReq = await returnService.getCustomerReturn(req.user.id, req.params.returnId);
    res.json({ success: true, data: { return: returnReq } });
  } catch (err) {
    next(err);
  }
}

export async function checkReturnEligibility(req, res, next) {
  try {
    const { subOrderId } = req.params;
    const result = await returnService.checkReturnEligibility(req.user.id, subOrderId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Shop controllers ──────────────────────────────────────────

export async function listShopReturns(req, res, next) {
  try {
    const shopId = req.shopId;
    const { status, page = 1, limit = 20 } = req.query;
    const result = await returnService.getShopReturns(shopId, {
      status,
      page: +page,
      limit: +limit,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getShopReturn(req, res, next) {
  try {
    const returnReq = await returnService.getShopReturn(req.shopId, req.params.returnId);
    res.json({ success: true, data: { return: returnReq } });
  } catch (err) {
    next(err);
  }
}

export async function approveReturn(req, res, next) {
  try {
    const { returnId } = req.params;
    const { refundAmountPaise, refundMethod } = req.body;

    const result = await returnService.approveReturn(req.shopId, returnId, {
      refundAmountPaise,
      refundMethod,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function rejectReturn(req, res, next) {
  try {
    const { returnId } = req.params;
    const { rejectionReason } = req.body;

    await returnService.rejectReturn(req.shopId, returnId, { rejectionReason });
    res.json({ success: true, data: { message: 'Return request rejected' } });
  } catch (err) {
    next(err);
  }
}
