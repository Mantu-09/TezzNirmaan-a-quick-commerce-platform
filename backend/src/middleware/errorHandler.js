import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  StateTransitionError,
  PaymentError,
} from '../utils/errors.js';

/**
 * Global error handler middleware.
 *
 * Catches all errors thrown or passed via next(err) and returns a
 * consistent JSON response:
 *
 *   {
 *     success: false,
 *     error: {
 *       code: 'VALIDATION_ERROR',
 *       message: 'Validation failed',
 *       details: { ... }     // optional — field-level errors, etc.
 *     }
 *   }
 *
 * In development mode, the response also includes the stack trace.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Log the error (always log in dev; in prod, only log 5xx)
  if (process.env.NODE_ENV !== 'production' || !(err instanceof AppError)) {
    console.error(`[ERROR] ${err.message}`, {
      method: req.method,
      path: req.originalUrl,
      stack: err.stack,
    });
  }

  // Known operational errors (our custom error classes)
  if (err instanceof AppError) {
    const response = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err.details) {
      response.error.details = err.details;
    }

    // Include stack in development for debugging
    if (process.env.NODE_ENV !== 'production') {
      response.error.stack = err.stack;
    }

    return res.status(err.statusCode).json(response);
  }

  // Zod validation errors (thrown by the validate middleware if not caught)
  if (err.name === 'ZodError') {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    });
  }

  // Unexpected / programming errors — don't leak internals in production
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message || 'An unexpected error occurred',
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    response.error.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}
