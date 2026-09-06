export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, status = 500, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(entity, id) {
    super(`${entity} "${id}" was not found`, 404, { entity, id });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message, issues) {
    super(message, 422, { issues });
    this.name = 'ValidationError';
  }
}

export class UpstreamError extends AppError {
  constructor(service, message, status = 502) {
    super(`${service}: ${message}`, status, { service });
    this.name = 'UpstreamError';
  }
}

/**
 * Narrows an unknown throw value to a readable message without leaking objects.
 * @param {unknown} error
 * @returns {string}
 */
export function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unexpected error';
}
