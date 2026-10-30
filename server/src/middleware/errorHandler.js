
/**
 * Centralized error handling middleware.
 * Catches errors thrown from route handlers and services,
 * normalizes them into consistent JSON responses.
 */

function errorHandler(err, req, res, next) {
  // Delegate to Express if the response has already started.
  if (res.headersSent) {
    return next(err);
  }

  // Handle structured service-layer errors safely.
  if (
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status <= 599 &&
    typeof err.message === 'string' &&
    err.message.trim()
  ) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.token && { token: err.token }),
    });
  }

  // Log unexpected errors on the server.
  console.error('Unhandled error:', err);

  // Do not expose internal error details in production.
  return res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' &&
      typeof err.message === 'string' && {
        details: err.message,
      }),
  });
}

/**
 * Wraps an async route handler so thrown errors go to
 * the centralized error middleware.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  asyncHandler,
};
