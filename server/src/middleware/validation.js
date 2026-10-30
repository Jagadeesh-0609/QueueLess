
/**
 * Validation middleware for request bodies and route parameters.
 */

function isPositiveInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0;
  }

  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    return false;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0;
}

function validateTokenCreation(req, res, next) {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    return res.status(400).json({
      error: 'Request body must be a valid JSON object',
    });
  }

  const { service_id, priority, customer_name } = req.body;

  if (service_id === undefined || service_id === null || service_id === '') {
    return res.status(400).json({
      error: 'service_id is required',
    });
  }

  if (!isPositiveInteger(service_id)) {
    return res.status(400).json({
      error: 'service_id must be a positive integer',
    });
  }

  let normalizedPriority = 0;

  if (priority !== undefined && priority !== null && priority !== '') {
    const parsedPriority =
      typeof priority === 'number'
        ? priority
        : typeof priority === 'string' && /^[0-9]+$/.test(priority)
          ? Number(priority)
          : NaN;

    if (
      !Number.isSafeInteger(parsedPriority) ||
      parsedPriority < 0
    ) {
      return res.status(400).json({
        error: 'priority must be a non-negative integer',
      });
    }

    normalizedPriority = parsedPriority;
  }

  if (
    customer_name !== undefined &&
    customer_name !== null &&
    typeof customer_name !== 'string'
  ) {
    return res.status(400).json({
      error: 'customer_name must be a string',
    });
  }

  // Normalize validated values.
  req.body.service_id = Number(service_id);
  req.body.priority = normalizedPriority;
  req.body.customer_name = String(customer_name || '')
    .trim()
    .slice(0, 100);

  next();
}

function validateIdParam(paramName = 'id') {
  return (req, res, next) => {
    const rawId = req.params[paramName];

    if (!isPositiveInteger(rawId)) {
      return res.status(400).json({
        error: `${paramName} must be a positive integer`,
      });
    }

    req.params[paramName] = Number(rawId);

    next();
  };
}

module.exports = {
  validateTokenCreation,
  validateIdParam,
};
