/** Shared domain errors. handleError (lib/api.ts) maps these to HTTP status by name. */

export class NotFoundError extends Error {
  constructor(msg = "Not found") {
    super(msg);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(msg = "Conflict") {
    super(msg);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(msg = "Invalid request") {
    super(msg);
    this.name = "ValidationError";
  }
}
