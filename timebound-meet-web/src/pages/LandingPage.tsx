import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Radio,
  ScrollText,
  ShieldOff,
  UserCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BrandLink } from "@/components/common/Brand";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth";
import { config } from "@/lib/config/env";

const CAPABILITIES = [
  {
    icon: Clock,
    title: "Meetings that end when they should",
    body: "Your invite works for the meeting it was made for. Turn up early and wait in comfort; once it wraps up, that's that.",
  },
  {
    icon: UserCheck,
    title: "Your invite is yours alone",
    body: "Every link is made out to one person. Forward it on and it simply won’t work for them.",
  },
  {
    icon: ShieldOff,
    title: "Change your mind, any time",
    body: "Take someone off the list and they’re out within seconds — even if the call is already running.",
  },
  {
    icon: ScrollText,
    title: "A clear record, afterwards",
    body: "Who joined, when they left, how long they stayed, and what was said. All in one place.",
  },
] as const;

const FLOW = [
  {
    step: "01",
    title: "Pick a time",
    body: "Choose when it starts and finishes. Everything else follows from that.",
  },
  {
    step: "02",
    title: "Invite your people",
    body: "Everyone gets their own link. Copy it once and send it however you like.",
  },
  {
    step: "03",
    title: "Everyone drops in",
    body: "They can arrive early and wait, or join right on time. Whatever suits them.",
  },
  {
    step: "04",
    title: "Look back later",
    body: "Who came, how long they stayed, and a full transcript when you need one.",
  },
] as const;

function Stat({
  value,
  label,
}: {
  value: string;
  label: string;
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function LandingPage(): React.JSX.Element {
  const { isAuthenticated } = useCurrentUser();

  const primaryCta = isAuthenticated
    ? { to: "/dashboard", label: "Go to my meetings" }
    : { to: "/signup", label: "Get started free" };

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <BrandLink />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/dashboard">My meetings</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Radio className="size-3 text-success" aria-hidden="true" />
                Invite-only meetings, done properly
              </span>

              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                {config.appName}
                <span className="mt-2 block text-2xl font-normal text-muted-foreground sm:text-3xl">
                  {config.tagline}
                </span>
              </h1>

              <p className="max-w-xl text-base text-muted-foreground">
                Most meeting links live forever and work for anyone who gets
                hold of them. On {config.appName}, an invite belongs to one
                person, works for one meeting, and can be taken back whenever
                you like.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to={primaryCta.to}>
                    {primaryCta.label}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                {!isAuthenticated ? (
                  <Button asChild size="lg" variant="outline">
                    <Link to="/login">I have an account</Link>
                  </Button>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Got an invite? Just open the link — we’ll take it from there.
              </p>
            </div>

            {/* A concrete picture of the thing the product protects. */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    Security architecture review
                  </p>
                  <p className="text-xs text-muted-foreground">
                    14:00 – 15:00 · Asia/Kolkata
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-medium text-success">
                  <span
                    className="size-1.5 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  Live
                </span>
              </div>

              <ul className="divide-y divide-border">
                {[
                  {
                    name: "Alice Rivera",
                    state: "Connected",
                    tone: "text-success",
                  },
                  {
                    name: "Bob Chen",
                    state: "Connected",
                    tone: "text-success",
                  },
                  {
                    name: "Dana Okafor",
                    state: "Removed 14:12",
                    tone: "text-destructive",
                  },
                ].map(person => (
                  <li
                    key={person.name}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <span className="truncate text-sm">{person.name}</span>
                    <span
                      className={`shrink-0 text-xs font-medium ${person.tone}`}
                    >
                      {person.state}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-2 rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">14:12</span> ·
                  Dana was removed from the call
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <div className="max-w-2xl space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                Built around who’s actually invited
              </h2>
              <p className="text-muted-foreground">
                Not a link anyone can pass around. Every invite is checked,
                every time, so you always know exactly who can walk in.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                <article
                  key={title}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                    <Icon
                      className="size-4.5 text-primary"
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Flow */}
        <section className="border-b border-border bg-accent/25">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">
              How it works
            </h2>

            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FLOW.map(({ step, title, body }) => (
                <li key={step} className="space-y-2">
                  <span className="font-mono text-xs text-primary">{step}</span>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-12 grid gap-8 border-t border-border pt-8 sm:grid-cols-3">
              <Stat value="Seconds" label="To remove someone mid-call" />
              <Stat value="One person" label="Per invite, never shared" />
              <Stat value="Every call" label="Recorded, start to finish" />
            </div>
          </div>
        </section>

        {/* Close */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                Ready when you are
              </h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {[
                  "No card needed",
                  "Set up in under a minute",
                  "Free to try",
                ].map(item => (
                  <li key={item} className="flex items-center gap-1.5">
                    <CheckCircle2
                      className="size-3.5 text-success"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Button asChild size="lg">
              <Link to={isAuthenticated ? "/calls/new" : "/signup"}>
                <CalendarClock aria-hidden="true" />
                {isAuthenticated ? "Set up a meeting" : "Get started free"}
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {config.appName}
          </p>
          <p>Made for meetings you actually want to be in.</p>
        </div>
      </footer>
    </div>
  );
}
