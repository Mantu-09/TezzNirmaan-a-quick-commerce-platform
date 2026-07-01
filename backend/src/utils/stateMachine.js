import { ORDER_STATUSES, USER_ROLES } from '../config/constants.js';
import { StateTransitionError } from './errors.js';

// ────────────────────────────────────────────────────────────
// Order State Machine
//
// Defines every valid transition, which roles may trigger it,
// and optional notes for debugging / audit logging.
//
// Source of truth: Architecture doc §3.2 — Valid Transitions Table
// ────────────────────────────────────────────────────────────

const { CUSTOMER, SHOP_OWNER, SHOP_STAFF, RIDER, PLATFORM_ADMIN } = USER_ROLES;

/**
 * State machine definition.
 * Key = current status
 * Value = array of { to, allowedRoles[], note? }
 */
const STATE_MACHINE = Object.freeze({
  [ORDER_STATUSES.PENDING]: [
    {
      to: ORDER_STATUSES.CONFIRMED,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Shop accepts the sub-order',
    },
    {
      to: ORDER_STATUSES.REJECTED,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Shop rejects the sub-order',
    },
    {
      to: ORDER_STATUSES.CANCELLED,
      allowedRoles: [CUSTOMER, SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Customer cancels or system auto-timeout (15 min)',
    },
  ],

  [ORDER_STATUSES.CONFIRMED]: [
    {
      to: ORDER_STATUSES.PREPARING,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Shop starts packing',
    },
    {
      to: ORDER_STATUSES.CANCELLED,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Shop cancels after confirming',
    },
  ],

  [ORDER_STATUSES.PREPARING]: [
    {
      to: ORDER_STATUSES.READY_FOR_PICKUP,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Items packed and ready',
    },
    {
      to: ORDER_STATUSES.CANCELLED,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Shop cancels during preparation',
    },
  ],

  [ORDER_STATUSES.READY_FOR_PICKUP]: [
    {
      to: ORDER_STATUSES.RIDER_ASSIGNED,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Rider assigned to the sub-order',
    },
    {
      to: ORDER_STATUSES.CANCELLED,
      allowedRoles: [SHOP_OWNER, SHOP_STAFF, PLATFORM_ADMIN],
      note: 'Shop cancels (rare — items damaged, etc.)',
    },
  ],

  [ORDER_STATUSES.RIDER_ASSIGNED]: [
    {
      to: ORDER_STATUSES.OUT_FOR_DELIVERY,
      allowedRoles: [RIDER, PLATFORM_ADMIN],
      note: 'Rider picks up from shop',
    },
    {
      to: ORDER_STATUSES.READY_FOR_PICKUP,
      allowedRoles: [RIDER, SHOP_OWNER, PLATFORM_ADMIN],
      note: 'Rider declines / reassigned → goes back to ready',
    },
  ],

  [ORDER_STATUSES.OUT_FOR_DELIVERY]: [
    {
      to: ORDER_STATUSES.DELIVERED,
      allowedRoles: [RIDER, PLATFORM_ADMIN],
      note: 'Delivery confirmed via OTP or photo',
    },
    {
      to: ORDER_STATUSES.CANCELLED,
      allowedRoles: [RIDER, PLATFORM_ADMIN],
      note: 'Delivery failed (rare — customer unreachable, address wrong)',
    },
  ],

  [ORDER_STATUSES.DELIVERED]: [
    {
      to: ORDER_STATUSES.RETURN_REQUESTED,
      allowedRoles: [CUSTOMER, PLATFORM_ADMIN],
      note: 'Customer requests return (time-limited: 24h quick, 48h scheduled)',
    },
  ],

  [ORDER_STATUSES.RETURN_REQUESTED]: [
    {
      to: ORDER_STATUSES.RETURNED,
      allowedRoles: [SHOP_OWNER, PLATFORM_ADMIN],
      note: 'Return processed and completed',
    },
  ],

  // Terminal states — no outgoing transitions
  [ORDER_STATUSES.REJECTED]: [],
  [ORDER_STATUSES.CANCELLED]: [],
  [ORDER_STATUSES.RETURNED]: [],
});

/**
 * Validate whether a state transition is allowed.
 *
 * @param {string} currentStatus - Current sub-order status
 * @param {string} newStatus     - Desired next status
 * @param {string} userRole      - Role of the user attempting the transition
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTransition(currentStatus, newStatus, userRole) {
  const transitions = STATE_MACHINE[currentStatus];

  if (!transitions) {
    return {
      valid: false,
      error: `Unknown current status: '${currentStatus}'`,
    };
  }

  const match = transitions.find((t) => t.to === newStatus);

  if (!match) {
    return {
      valid: false,
      error: `Transition from '${currentStatus}' to '${newStatus}' is not allowed`,
    };
  }

  if (!match.allowedRoles.includes(userRole)) {
    return {
      valid: false,
      error: `Role '${userRole}' is not authorized to transition from '${currentStatus}' to '${newStatus}'`,
    };
  }

  return { valid: true };
}

/**
 * Assert a transition is valid — throws StateTransitionError if not.
 * Convenience wrapper for use in service/controller code.
 */
export function assertTransition(currentStatus, newStatus, userRole) {
  const result = validateTransition(currentStatus, newStatus, userRole);
  if (!result.valid) {
    throw new StateTransitionError(currentStatus, newStatus, result.error);
  }
}

/**
 * Get all valid next statuses for a given current status and role.
 * Useful for UI: show the shop owner which actions are available.
 */
export function getAvailableTransitions(currentStatus, userRole) {
  const transitions = STATE_MACHINE[currentStatus] || [];
  return transitions
    .filter((t) => t.allowedRoles.includes(userRole))
    .map((t) => ({ to: t.to, note: t.note }));
}
