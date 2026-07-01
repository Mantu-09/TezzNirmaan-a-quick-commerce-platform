// ────────────────────────────────────────────────────────────
// Custom Error Classes
// Base class + domain-specific errors with default HTTP codes.
// ────────────────────────────────────────────────────────────

/**
 * Base application error. All custom errors extend this.
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status code (default 500)
 * @param {string} code - Machine-readable error code (e.g. 'VALIDATION_ERROR')
 * @param {*} details - Optional additional error details (field errors, etc.)
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // distinguishes expected errors from programming bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', message = null) {
    super(message || `${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class StateTransitionError extends AppError {
  constructor(fromStatus, toStatus, message = null) {
    super(
      message || `Invalid state transition from '${fromStatus}' to '${toStatus}'`,
      409,
      'INVALID_STATE_TRANSITION',
      { fromStatus, toStatus }
    );
  }
}

export class PaymentError extends AppError {
  constructor(message = 'Payment processing failed', details = null) {
    super(message, 402, 'PAYMENT_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}
