import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage(): React.JSX.Element {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">We can't find that page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It might have moved, or it may not be shared with you any more.
      </p>
      <Button asChild>
        <Link to="/dashboard">Back to my meetings</Link>
      </Button>
    </div>
  );
}
