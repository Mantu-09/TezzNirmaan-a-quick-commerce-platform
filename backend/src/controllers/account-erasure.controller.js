// ────────────────────────────────────────────────────────────
// account-erasure.controller.js — P5-4C
// ────────────────────────────────────────────────────────────
import { eraseCustomerAccount } from '../services/account-erasure.service.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * DELETE /customer/account
 * Body: { confirmation: "DELETE MY ACCOUNT" }
 *
 * Requires the user to explicitly type the confirmation string
 * so accidental deletions are impossible.
 */
export async function deleteAccount(req, res, next) {
  try {
    const userId       = req.user.id;
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE MY ACCOUNT') {
      return next(new AppError(
        'Please type "DELETE MY ACCOUNT" exactly to confirm.',
        400,
        'INVALID_CONFIRMATION'
      ));
    }

    logger.info('deleteAccount: confirmation received', { userId });
    const result = await eraseCustomerAccount(userId);

    // The auth session is now invalid — client must log out
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
