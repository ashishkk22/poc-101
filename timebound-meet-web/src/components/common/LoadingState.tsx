import { Skeleton } from "@/components/ui/skeleton";

type LoadingStateProps = {
  label?: string;
  rows?: number;
};

export function LoadingState({
  label = "Loading…",
  rows = 3,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-3"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

type InlineSpinnerTextProps = {
  label: string;
};

export function InlineSpinnerText({ label }: InlineSpinnerTextProps) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="text-sm text-muted-foreground"
    >
      {label}
    </p>
  );
}
