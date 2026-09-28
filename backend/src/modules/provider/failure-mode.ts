import { env, isProduction } from '../../config/env.js';
import { ProviderFailureMode } from './provider.types.js';

/**
 * Runtime-switchable failure injection.
 *
 * Refuses to leave HEALTHY in production; the env validator enforces the same
 * rule at boot, this guards the runtime setter used by demo tooling and tests.
 */
let currentMode: ProviderFailureMode = env.PROVIDER_FAILURE_MODE;

export function getFailureMode(): ProviderFailureMode {
  return currentMode;
}

export function setFailureMode(mode: ProviderFailureMode): void {
  if (isProduction && mode !== ProviderFailureMode.HEALTHY) {
    throw new Error('Provider failure injection is not available in production');
  }
  currentMode = mode;
}

export function resetFailureMode(): void {
  currentMode = isProduction ? ProviderFailureMode.HEALTHY : env.PROVIDER_FAILURE_MODE;
}

export async function applySlowness(): Promise<void> {
  if (currentMode !== ProviderFailureMode.SLOW) return;
  await new Promise((resolve) => setTimeout(resolve, env.PROVIDER_SLOW_MS));
}
