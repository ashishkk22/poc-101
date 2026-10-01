import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState } from "react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD_LENGTH } from "@/lib/api";

type PasswordFieldProps = ComponentProps<"input">;

/** A password input with a reveal toggle that stays keyboard reachable. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(shown => !shown)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);

/**
 * Length-based strength feedback.
 *
 * It reports only what the client can honestly know. The backend sets the
 * actual minimum, and this never blocks a submission the server would accept.
 */
export function PasswordStrength({
  value,
}: {
  value: string;
}): React.JSX.Element {
  const id = useId();

  const checks = [
    {
      label: `${MIN_PASSWORD_LENGTH}+ characters`,
      passed: value.length >= MIN_PASSWORD_LENGTH,
    },
    {
      label: "Upper and lower case",
      passed: /[a-z]/.test(value) && /[A-Z]/.test(value),
    },
    { label: "A number or symbol", passed: /[\d\W_]/.test(value) },
  ];

  const score = checks.filter(check => check.passed).length;
  const label =
    value.length === 0 ? "" : (["Weak", "Weak", "Fair", "Strong"][score] ?? "");

  return (
    <div className="space-y-2">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map(index => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index < score
                ? score === 3
                  ? "bg-success"
                  : score === 2
                    ? "bg-warning"
                    : "bg-destructive"
                : "bg-muted",
            )}
          />
        ))}
      </div>
      <ul id={id} className="space-y-0.5 text-xs text-muted-foreground">
        {label ? (
          <li className="sr-only" aria-live="polite">
            Password strength: {label}
          </li>
        ) : null}
        {checks.map(check => (
          <li
            key={check.label}
            className={cn(
              "flex items-center gap-1.5",
              check.passed && "text-success",
            )}
          >
            <span aria-hidden="true">{check.passed ? "✓" : "·"}</span>
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
