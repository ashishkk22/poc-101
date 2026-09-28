import { Skeleton } from '@/components/ui/skeleton';

export function LoadingState({
  label = 'Loading…',
  rows = 3,
}: {
  label?: string;
  rows?: number;
}): React.JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function InlineSpinnerText({ label }: { label: string }): React.JSX.Element {
  return (
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {label}
    </p>
  );
}
