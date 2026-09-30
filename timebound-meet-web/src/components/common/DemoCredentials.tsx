import { KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";

const DEMO_PASSWORD = "SyncDemo123!";
const DEMO_ACCOUNTS = [
  "organizer@example.com",
  "alice@example.com",
  "bob@example.com",
] as const;

type DemoCredentialsProps = {
  onPick?: (email: string) => void;
};
/**
 * Seeded demo accounts, shown in development only.
 *
 * These exist solely because the backend seed creates them; the block is
 * compiled out of a production build, so nothing about them ships.
 */
export function DemoCredentials({ onPick }: DemoCredentialsProps) {
  if (!import.meta.env.DEV) return null;

  return (
    <Alert variant="info">
      <KeyRound aria-hidden="true" />
      <div className="space-y-2">
        <AlertTitle>Try it out</AlertTitle>
        <AlertDescription>
          <span className="block">
            Password <code className="font-mono text-xs">{DEMO_PASSWORD}</code>
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map(email => (
              <button
                key={email}
                type="button"
                onClick={() => onPick?.(email)}
                className="rounded-md border border-border bg-card px-2 py-1 font-mono text-xs transition-colors hover:bg-accent"
              >
                {email}
              </button>
            ))}
          </span>
        </AlertDescription>
      </div>
    </Alert>
  );
}
