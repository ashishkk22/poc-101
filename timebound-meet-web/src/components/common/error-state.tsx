import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toDisplayError } from '@/lib/errors';

/**
 * The only component that renders a backend failure.
 *
 * It shows the mapped message and the request id — never a stack trace, a
 * token, or an internal identifier.
 */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}): React.JSX.Element {
  const display = toDisplayError(error);

  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <div className="flex-1 space-y-2">
        <AlertTitle>{display.title}</AlertTitle>
        <AlertDescription>{display.description}</AlertDescription>
        {display.requestId ? (
          <p className="text-xs text-muted-foreground">
            Reference: <code className="font-mono">{display.requestId}</code>
          </p>
        ) : null}
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
            {retrying ? null : <RefreshCw aria-hidden="true" />}
            Try again
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
