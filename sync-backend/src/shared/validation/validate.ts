import { type NextFunction, type Request, type Response } from 'express';
import { type ZodType, type z } from 'zod';
import { AppError, ErrorCode } from '../errors/index.js';

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
  headers?: ZodType;
}

interface ValidationIssue {
  path: string;
  message: string;
}

function toIssues(error: z.ZodError, source: string): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [source, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

/**
 * Validates and REPLACES the request parts with their parsed output, so
 * downstream code can only ever see coerced, whitelisted values. Invalid
 * input is rejected before any business logic runs.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ValidationIssue[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) Object.assign(req.params, result.data);
      else issues.push(...toIssues(result.error, 'params'));
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) {
        // Express 5 exposes req.query as a getter-only property.
        Object.defineProperty(req, 'validatedQuery', { value: result.data, configurable: true });
      } else {
        issues.push(...toIssues(result.error, 'query'));
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.body = result.data;
      else issues.push(...toIssues(result.error, 'body'));
    }

    if (schemas.headers) {
      const result = schemas.headers.safeParse(req.headers);
      if (!result.success) issues.push(...toIssues(result.error, 'headers'));
    }

    if (issues.length > 0) {
      next(new AppError(ErrorCode.VALIDATION_ERROR, { details: issues }));
      return;
    }

    next();
  };
}

/** Reads the parsed query written by `validate`. */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery?: T }).validatedQuery as T;
}
