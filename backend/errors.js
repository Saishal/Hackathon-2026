// HTTP errors with a stable machine-readable code. The response body keeps the v1 `error` string
// (a human-readable message) and adds `code`, plus `details` for field-level validation failures.
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

const badRequest = (message, code = 'invalid_request', details) => new HttpError(400, code, message, details);
const unauthenticated = (message = 'Sign in to continue.') => new HttpError(401, 'unauthenticated', message);
const notFound = (what = 'The requested record') => new HttpError(404, 'not_found', `${what} was not found.`);
const conflict = (message, code = 'conflict') => new HttpError(409, code, message);

function forbidden(permission, message = 'Your role does not allow this action.') {
  const error = new HttpError(403, 'forbidden', message);
  if (permission) error.requiredPermission = permission;
  return error;
}

// details: [{ field, code, message }]
function validationError(details) {
  const message = details.length === 1 ? details[0].message : `${details.length} fields need attention.`;
  return new HttpError(400, 'validation_failed', message, details);
}

module.exports = { HttpError, badRequest, unauthenticated, forbidden, notFound, conflict, validationError };
