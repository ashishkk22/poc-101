import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, ScrollText, ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLink } from '@/components/common/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { config } from '@/lib/config/env';

const PILLARS = [
  {
    icon: Clock,
    title: 'Access lives in a window',
    body: 'An invitation works inside the scheduled window and nowhere else — not before it opens, not after it closes.',
  },
  {
    icon: ShieldOff,
    title: 'Change your mind any time',
    body: 'Take someone off the guest list and they drop out within seconds — even mid-call.',
  },
  {
    icon: ScrollText,
    title: 'See exactly what happened',
    body: 'Who joined, who left, who tried and could not — all there when you need it.',
  },
] as const;

/**
 * Shared chrome for the signed-out pages.
 *
 * The left panel carries the product argument; the right carries the form.
 * On a phone the panel collapses to the wordmark, so the form is what loads
 * above the fold.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
  backTo,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  backTo?: { to: string; label: string };
}): React.JSX.Element {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-accent/40 p-10 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/10 blur-3xl"
        />
        <BrandLink />

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">{config.tagline}</h2>
            <p className="text-sm text-muted-foreground">
              Set a time, invite the people you want, and know exactly who was there.
            </p>
          </div>

          <ul className="space-y-5">
            {PILLARS.map(({ icon: Icon, title: pillarTitle, body }) => (
              <li key={pillarTitle} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{pillarTitle}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} {config.appName}
        </p>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="lg:hidden">
            <BrandLink />
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm space-y-6">
            {backTo ? (
              <Link
                to={backTo.to}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {backTo.label}
              </Link>
            ) : null}

            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <div className="text-sm text-muted-foreground">{description}</div>
            </div>

            {children}

            {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
