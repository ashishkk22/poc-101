import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom implements neither of these, and several components rely on them.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof globalThis.matchMedia;
}

// jsdom has no media pipeline, so `srcObject` does not exist on a <video>.
// Backing it with a plain property is what lets tests assert that a stream was
// actually attached to the element.
if (!('srcObject' in HTMLMediaElement.prototype)) {
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    writable: true,
    value: null,
  });
}

// jsdom implements no layout, so scrolling is a no-op rather than a crash.
Element.prototype.scrollIntoView ??= () => undefined;

globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

