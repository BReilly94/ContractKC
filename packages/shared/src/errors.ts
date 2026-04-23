export class AppError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    if (details !== undefined) this.details = details;
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: Record<string, unknown>) {
    super('UNAUTHORIZED', message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: Record<string, unknown>) {
    super('FORBIDDEN', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: Record<string, unknown>) {
    super('NOT_FOUND', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, details);
  }
}

export class NotSupportedInLocalError extends AppError {
  constructor(message: string) {
    super('NOT_SUPPORTED_LOCAL', message);
  }
}
