import { type Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app/app.js';

let app: Express | null = null;

export function testApp(): Express {
  app ??= createApp();
  return app;
}

export function api() {
  return request(testApp());
}

/** Authenticated request helper — attaches the session cookie. */
export function asUser(cookie: string) {
  const agent = request(testApp());
  return {
    get: (url: string) => agent.get(url).set('Cookie', cookie),
    post: (url: string) => agent.post(url).set('Cookie', cookie),
  };
}
