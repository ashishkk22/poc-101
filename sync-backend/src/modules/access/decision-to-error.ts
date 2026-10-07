import { AppError, type ErrorCode } from '../../shared/errors/index.js';
import { type Decision, type Denied } from './access.types.js';

/** Converts a typed denial into the HTTP error the client will see. */
export function denialToError(denied: Denied): AppError {
  return new AppError(denied.code as ErrorCode);
}

/**
 * Unwraps a decision or throws. Keeps call sites free of branching so that
 * "forgot to check the decision" cannot compile into a security hole.
 */
export function unwrap<T>(decision: Decision<T>): T {
  if (!decision.allowed) throw denialToError(decision);
  return decision.value;
}
