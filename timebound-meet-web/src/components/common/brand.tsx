import { Link, type LinkProps } from "react-router-dom";
import { config } from "@/lib/config/env";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  title?: string;
};

/**
 * The wordmark.
 *
 * The clock inside a shield is the whole product in one glyph: access that
 * exists only for a window, and only for the person it was issued to.
 */
export function BrandMark({
  className,
  title = config.appName,
}: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn("size-7", className)}
      fill="none"
    >
      <path
        d="M16 2.5 4.5 7v9.2c0 6.6 4.7 11.6 11.5 13.3 6.8-1.7 11.5-6.7 11.5-13.3V7L16 2.5Z"
        className="fill-primary/12 stroke-primary"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle
        cx="16"
        cy="15.5"
        r="6"
        className="stroke-primary"
        strokeWidth="1.8"
      />
      <path
        d="M16 12v3.8l2.6 1.6"
        className="stroke-primary"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type BrandWordmarkProps = {
  className?: string;
  showTagline?: boolean;
};

export function BrandWordmark({
  className,
  showTagline = false,
}: BrandWordmarkProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="font-semibold tracking-tight">{config.appName}</span>
        {showTagline ? (
          <span className="mt-0.5 text-xs font-normal text-muted-foreground">
            {config.tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function BrandLink({ to = "/", className }: LinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        "rounded-md transition-opacity hover:opacity-80",
        className,
      )}
      aria-label={`${config.appName} home`}
    >
      <BrandWordmark />
    </Link>
  );
}
