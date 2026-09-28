import 'express';
import { type AuthenticatedUser } from '../../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Correlation ID attached by the requestId middleware. */
      requestId: string;
      /**
       * The server-resolved session user. Populated only by authentication
       * middleware — never from request body, query or headers.
       */
      user?: AuthenticatedUser;
    }
  }
}

export {};
