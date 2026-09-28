import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Cursor pagination, surfaced.
 *
 * The backend caps a page at 100 rows and hands back an opaque `nextCursor`;
 * nothing here fetches an unbounded history.
 */
export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
  loadedCount,
  noun = 'items',
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  loadedCount: number;
  noun?: string;
}): React.JSX.Element | null {
  if (!hasMore) {
    return loadedCount > 0 ? (
      <p className="pt-1 text-center text-xs text-muted-foreground">
        All {loadedCount} {noun} shown
      </p>
    ) : null;
  }

  return (
    <div className="flex justify-center pt-1">
      <Button variant="outline" size="sm" onClick={onLoadMore} loading={loading}>
        {loading ? null : <ChevronDown aria-hidden="true" />}
        Load more
      </Button>
    </div>
  );
}
