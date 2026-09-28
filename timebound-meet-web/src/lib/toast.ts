import { toast } from 'sonner';
import { toDisplayError } from './errors';

/**
 * Mutation feedback.
 *
 * Failures go through the same mapper as every other error surface, so a
 * toast can never show copy an inline panel would have refused to show.
 */
export const notify = {
  success(message: string, description?: string): void {
    toast.success(message, description ? { description } : undefined);
  },

  info(message: string, description?: string): void {
    toast(message, description ? { description } : undefined);
  },

  error(error: unknown): void {
    const display = toDisplayError(error);
    toast.error(display.title, {
      description: display.requestId
        ? `${display.description} (ref ${display.requestId})`
        : display.description,
    });
  },
};
