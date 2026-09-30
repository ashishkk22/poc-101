import { LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, type ButtonProps } from "@/components/ui/Button";
import type { Call } from "@/lib/api/types";
import { parse } from "@/lib/date/format";

/**
 * Entry to a call.
 *
 * Whether the button appears is a hint drawn from what the API already
 * returned; whether entry is allowed is decided when the person actually
 * tries. Early entry is offered on purpose — the invitation is the gate, not
 * the clock — so a scheduled call that has not started yet still shows it.
 */
export function canEnter(call: Call): boolean {
  if (
    call.status === "CANCELLED" ||
    call.status === "ENDED" ||
    call.status === "DRAFT"
  ) {
    return false;
  }

  // The end of the window closes the room even if the scheduler lags.
  const end = parse(call.scheduledEnd);
  return !end || end.getTime() > Date.now();
}

type JoinCallButtonProps = {
  call: Call;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
};

export function JoinCallButton({
  call,
  size,
  variant,
  className,
}: JoinCallButtonProps) {
  if (!canEnter(call)) return null;

  const start = parse(call.scheduledStart);
  const early = start ? start.getTime() > Date.now() : false;

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link to={`/call/${call.id}/lobby`}>
        <LogIn aria-hidden="true" />
        {early ? "Join early" : "Join call"}
      </Link>
    </Button>
  );
}
