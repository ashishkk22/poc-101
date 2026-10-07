import { type Response } from 'express';

/** Every successful response is `{ data: ... }`; every failure is `{ error: ... }`. */
export function sendData<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export interface PageEnvelope<T> {
  items: T[];
  nextCursor: string | null;
}

export function sendPage<T>(res: Response, page: PageEnvelope<T>, status = 200): void {
  res.status(status).json(page);
}

export function sendNoContent(res: Response): void {
  res.status(204).end();
}
