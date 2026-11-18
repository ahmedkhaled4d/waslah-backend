export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, unknown>) {
    super('VALIDATION_ERROR', 'Invalid request', 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 409);
  }
}

export class WindowClosedError extends AppError {
  constructor() {
    super(
      'WINDOW_CLOSED',
      'The 24-hour customer service window is closed. Send an approved template instead.',
      409,
    );
  }
}

export class WhatsAppApiError extends AppError {
  readonly retryable: boolean;

  constructor(message: string, waCode: number | undefined, retryable: boolean) {
    super('WHATSAPP_API_ERROR', message, 502, { waCode });
    this.retryable = retryable;
  }
}

/** Thrown by webhook processing when Meta should redeliver the payload (returned as 500). */
export class RetryableError extends Error {}
