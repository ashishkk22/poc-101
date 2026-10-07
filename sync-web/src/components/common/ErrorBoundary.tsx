import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface State {
  error: Error | null;
}

/**
 * Last line of defence for a render-time crash.
 *
 * It shows that something broke without printing the exception: a stack trace
 * on screen is exactly the kind of internal detail this application does not
 * expose. The detail goes to the console for whoever is debugging.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-svh items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Well, that went sideways</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This page ran into trouble. A quick reload usually sorts it, and
              nothing you've done has been lost.
            </p>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden="true" />
              Reload the page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
