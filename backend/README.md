# TimeBound Meet — Backend

**Meet only when you're invited.**

A secure scheduled-meeting backend. An organizer schedules a call for a defined
time window and invites named participants. Each participant receives an
individual, opaque join credential, and can join only when **all** of the
following hold at the instant they act:

```
authenticated user
+ correct participant
+ active invitation
+ valid call
+ current server time inside the scheduled window
```

An organizer can revoke an invitation before or during the meeting, and that
revocation is authoritative immediately.

---

## 1. The defining property

> A meeting invitation is a **revocable, participant-bound, time-bound
> authorization credential**, and its validity is evaluated against current
> server state for **every** protected operation.

This is not a CRUD service with some checks bolted on. It is an authorization
engine with meeting features around it. The critical path is:

```
User → Call → Invitation → Opaque Token → Authorization → Time Window
     → Attendance → Provider Session → Realtime Revalidation
     → Revocation → Replay Rejection
```

A successful join grants **no lasting permission**. The next heartbeat, the
next token replay and the next transcript read are each authorized from
scratch against the database.

---

## 2. Architecture

A modular monolith. No microservices.

```
                         React client
                              │
                            HTTPS
                              │
                   ┌──────────▼───────────┐
                   │    Express 5 API     │
                   └──────────┬───────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
        ▼                     ▼                      ▼
  Authentication       Domain services         WebSocket gateway
  (Better Auth)     ┌───────┴────────┐          (Socket.IO)
        │           │  access policy │                │
        │           │  (the engine)  │                │
        │           └───────┬────────┘                │
        │                   ▼                         │
        │             Repositories                    │
        │                   │                         │
        │                   ▼                         │
        └──────────►   PostgreSQL                     │
                            ▲                         │
                            │                         │
                          Redis ◄─────────────────────┘
                            │
                          BullMQ
                            │
                    ┌───────▼────────┐
                    │ Worker process │
                    └───────┬────────┘
                            ▼
                    Provider adapters
                  (meeting, transcription)
```

### Source-of-truth rules

| Component         | Role                                                          |
| ----------------- | ------------------------------------------------------------- |
| PostgreSQL        | **Authoritative** application state                           |
| Redis             | Realtime fan-out, rate limiting, queues — never authoritative |
| BullMQ            | Asynchronous work                                             |
| Browser           | Never authoritative                                           |
| External provider | Never authoritative for application permissions               |

### Request flow

```
route → middleware → authentication → validation
      → application service → domain policy → repository → response mapper
```

Business logic never lives in a controller, and no route implements its own
authorization.

---

## 3. Quick start

### With Docker (reproducible, recommended)

```bash
cd backend
docker compose up --build
```

No `.env` is needed — Compose ships working local defaults. That brings up
`postgres`, `redis`, `api` and `worker`; the API container applies migrations
on boot (`RUN_MIGRATIONS=true`). Then seed the demo data:

```bash
docker compose exec api pnpm db:seed:prod
```

The production image contains no dev dependencies, so it seeds from compiled
output (`db:seed:prod`) rather than `tsx`.

**Secrets.** The Compose defaults are local-only and safe to commit. They use
`TIMEBOUND_*` variable names so that Compose's automatic `./.env` substitution
cannot leak the application's placeholder secret into the stack. For anything
beyond a local demo, supply a real one:

```bash
TIMEBOUND_AUTH_SECRET="$(openssl rand -base64 32)" docker compose up
```

The server refuses to boot in production mode with a placeholder secret — that
check is deliberate, so a copied `.env.example` can never reach a deployment.

- API — http://localhost:4000
- Health — http://localhost:4000/health
- Readiness — http://localhost:4000/ready

Containers address each other by **service name** (`postgres`, `redis`), never
by IP.

### Without Docker

Requires Node 22+ (24 recommended), pnpm 10, PostgreSQL 17 and Redis 7.

```bash
cd backend
cp .env.example .env
pnpm install
pnpm db:deploy        # prisma migrate deploy
pnpm db:seed
pnpm dev              # API on :4000
pnpm dev:worker       # worker, in a second terminal
```

---

## 4. Environment variables

Every variable is validated by Zod at startup. **The process refuses to boot on
invalid configuration** — a half-configured security boundary is worse than
none. See `.env.example` for the complete annotated list.

| Variable                           | Purpose                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| `NODE_ENV`                         | `development` \| `test` \| `production`                     |
| `PORT`                             | API port (default 4000)                                     |
| `DATABASE_URL`                     | PostgreSQL connection string                                |
| `REDIS_URL`                        | Redis connection string                                     |
| `BETTER_AUTH_SECRET`               | Session signing secret; must not be the placeholder in prod |
| `BETTER_AUTH_URL`                  | Public base URL of the API                                  |
| `FRONTEND_ORIGIN`                  | CORS allowlist (comma-separated). `*` is rejected           |
| `JOIN_URL_BASE`                    | Base used to build join links at invitation creation        |
| `PROVIDER_MODE`                    | `mock` \| `live`                                            |
| `TRANSCRIPTION_MODE`               | `mock` \| `live`                                            |
| `PROVIDER_FAILURE_MODE`            | Failure injection; **must be `HEALTHY` in production**      |
| `INVITATION_TTL_MINUTES_AFTER_END` | Credential grace period past the call end                   |
| `TRANSCRIPT_RETENTION_DAYS`        | Retention window (default 30)                               |
| `HEARTBEAT_TIMEOUT_SECONDS`        | Liveness threshold before a session is reaped               |
| `RATE_LIMIT_*`                     | Per-bucket limits, all configurable                         |

Secrets are never hard-coded and never logged.

---

## 5. Database

PostgreSQL via Prisma 7 (with the `@prisma/adapter-pg` driver adapter).

```bash
pnpm db:migrate     # create a migration in development
pnpm db:deploy      # prisma migrate deploy — the production mechanism
pnpm db:seed
pnpm db:reset
pnpm demo:reset     # reset + reseed, for a clean demo
```

`prisma db push` is **not** the production migration mechanism and is not used.

### Models

`User`, `Call`, `Invitation`, `Attendance`, `AttendanceSession`, `Transcript`,
`AuditEvent`, plus the Better Auth tables (`Session`, `Account`,
`Verification`).

### Constraints that carry security weight

| Constraint                                 | What it prevents                                  |
| ------------------------------------------ | ------------------------------------------------- |
| `UNIQUE(Invitation.tokenHash)`             | Two invitations sharing a credential              |
| `UNIQUE(Invitation.callId, participantId)` | Duplicate invitations for one participant         |
| `UNIQUE(Attendance.callId, participantId)` | Split attendance records under concurrency        |
| `UNIQUE(Transcript.callId)`                | Concurrent finalization producing two transcripts |

Indexes back every history query; see `prisma/schema.prisma`.

---

## 6. Authorization model

All policies live in **one module**: `src/modules/access/`. No route or service
performs its own ad-hoc check.

```
authorizeJoin              authorizeCallRead        authorizeCallManage
authorizeInvitationRead    authorizeInvitationRevoke
authorizeAttendanceRead    authorizeTranscriptRead   authorizeAuditRead
authorizeRealtimeCallRoom
```

### `authorizeJoin` — the ordered checks

1. Current user exists
2. Invitation exists (looked up by hash)
3. Call exists
4. Invitation status is `ACTIVE`
5. Invitation has not expired
6. **The caller is the invited participant**
7. Call is not cancelled, ended or draft
8. Current server time is inside `[scheduledStart, scheduledEnd)`
9. No further restriction applies

The order is part of the contract. Participant ownership is verified before any
call-state or timing detail can influence the response, so someone holding
another person's token learns only that the token is not theirs — never that
call's schedule.

Each policy returns `ALLOWED` or a **typed denial**, and `unwrap()` converts a
denial into the HTTP error, so "forgot to check the result" cannot compile into
a hole.

### Anti-discovery

Where a caller has no relationship to a call, the API answers exactly as it
would for a call that does not exist. Call-ID guessing reveals nothing about
rosters, transcripts, attendance or audit.

### What is never trusted

- Cookie presence alone
- A client-supplied user ID, organizer ID, participant ID or role
- `Date.now()` from the client, a countdown, or any request-supplied time
- The external provider's opinion about permissions
- A previously successful authorization decision

---

## 7. Token model

The join credential is an **opaque random token**, not a JWT.

```
rawToken = base64url(randomBytes(32))     # 256 bits of entropy
stored   = sha256(rawToken)               # only the hash is persisted
```

| Rule                                          | Where enforced                                      |
| --------------------------------------------- | --------------------------------------------------- |
| The raw token is never stored                 | Only `tokenHash` exists in the schema               |
| The raw token is never logged                 | Pino redaction + join URLs masked in access logs    |
| The raw token never appears in audit metadata | `tokenFingerprint()` (12 hex chars) is used instead |
| It is returned exactly once, at creation      | `joinUrl` on the creation response only             |
| Malformed tokens cost a regex, not a query    | `isWellFormedRawToken()` runs before lookup         |

A revoked or expired token fails at lookup time, every time, forever.

---

## 8. Time semantics

**Start inclusive, end exclusive**, against server time:

```
09:00:00.000 → allowed
09:59:59.999 → allowed
10:00:00.000 → denied
```

Defined once in `src/shared/time/window.ts` (`isCallWindowOpen`,
`isBeforeCallWindow`, `isAfterCallWindow`); nothing else compares boundaries by
hand. Timestamps are stored in UTC with the IANA timezone kept separately.

The window check is independent of `call.status`, so a delayed or failed
scheduler can never leave a call joinable past its scheduled end.

---

## 9. Revocation

```
Organizer → revoke API → PostgreSQL transaction → COMMIT
                                                    │
                        ┌───────────────────────────┼───────────────────┐
                        ▼                           ▼                   ▼
                  Redis Pub/Sub              provider cleanup      audit event
                        │                        (queued)
                        ▼
                    Socket.IO → participant client
```

The transaction takes a **row lock** (`SELECT … FOR UPDATE`) on the invitation
before reading its status. Join does the same. That shared lock is what makes
the core invariant hold:

> Once the revoke transaction commits, no subsequent authorization check can
> admit that invitation.

The guarantee comes from PostgreSQL, not from JavaScript execution order.

**Realtime is not the authorization source of truth.** If Socket.IO delivery
fails entirely, the participant's next heartbeat re-checks authorization and
returns `403 INVITE_REVOKED`. Security is unchanged when realtime is down.

Revocation is **idempotent**: a second request returns 200 with the original
`revokedAt` and writes no additional audit event.

---

## 10. Join flow, and why it re-checks

```
1. authorize under a row lock          (serializes against revoke)
2. issue the provider session          (OUTSIDE any transaction)
3. re-authorize under a row lock, then record attendance
```

Step 3 is not redundant. The provider call is a network round-trip during which
a revoke may commit. Re-checking means a participant can never be admitted on
the strength of a decision that has since been invalidated. If step 3 denies,
the now-orphaned provider session is handed to the cleanup queue rather than
leaked.

A database transaction is never held open across a third-party network call.

---

## 11. Attendance

One logical `Attendance` per (call, participant); one `AttendanceSession` per
physical device connection.

**Total connected time is the UNION of session intervals, not their sum:**

```
Laptop 10:00 – 10:40
Phone  10:20 – 10:50
                        → 50 minutes, not 70
```

Using two devices must not inflate attendance.

Totals are **recomputed** from the full session list on every change rather
than incremented. Recomputation is inherently idempotent: a retried leave, a
duplicate request or a replayed job all converge on the same number.

---

## 12. Provider architecture

```ts
interface MeetingProvider {
  createMeeting(...)
  issueParticipantSession(...)
  revokeParticipantSession(...)
  endMeeting(...)
}

interface TranscriptionProvider {
  getLiveCaptions(...)
  getTranscript(...)
}
```

Shipped implementations: `MockMeetingProvider`, `MockTranscriptionProvider`.

**Isolation rule: application authorization never depends on provider health.**

| Failure                     | Behaviour                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Provider join fails         | `503 PROVIDER_UNAVAILABLE`; **no** attendance session recorded; invitation untouched |
| Provider revoke fails       | Application access stays revoked; cleanup queue retries                              |
| Caption stream fails        | Call continues; authorization unaffected                                             |
| Transcript generation fails | Transcript marked `FAILED`; attendance untouched; queue retries                      |

Failure injection for demos and tests (`PROVIDER_FAILURE_MODE`, development
only): `HEALTHY`, `SLOW`, `JOIN_FAILURE`, `CAPTION_FAILURE`,
`TRANSCRIPT_FAILURE`, `REVOKE_FAILURE`.

---

## 13. Realtime

Socket.IO with the Redis adapter, so events fan out across API replicas.

Events: `INVITATION_REVOKED`, `CALL_ENDED`, `FORCED_DISCONNECT`,
`CAPTION_STATUS_CHANGED`.

Rooms: `user:<id>`, `call:<id>`, `session:<id>`.

Two rules govern the gateway:

1. **A connection carries no ambient authority.** Authentication identifies the
   socket's user; joining a call room is a separate, database-backed check
   (`authorizeRealtimeCallRoom`).
2. **Realtime is a hint, never a grant.** Anything a client does in response to
   an event is re-authorized over HTTP.

Participant-specific events go to that participant's room only — nothing
sensitive is broadcast call-wide.

---

## 14. Workers

Run as a separate process (`pnpm worker`) so a long transcript job never
competes with request latency.

| Queue              | Work                                        |
| ------------------ | ------------------------------------------- |
| `transcript`       | Generation, 5 attempts, exponential backoff |
| `retention`        | Hourly expiry sweep                         |
| `provider-cleanup` | Session/meeting teardown, 10 attempts       |
| `call-lifecycle`   | Per-minute reconciliation tick              |

Deterministic job IDs (`transcript-call-<callId>`,
`retention-transcript-<id>`) collapse duplicate enqueues, and **every handler
is idempotent**, because BullMQ delivery is at-least-once.

The lifecycle tick performs _reconciliation, not enforcement_: it advances
`SCHEDULED → LIVE → ENDED`, expires overdue invitations and reaps sessions whose
heartbeats stopped. Authorization already rejects on the clock, so a late or
failed tick cannot widen access.

---

## 15. Retention

Transcripts expire `TRANSCRIPT_RETENTION_DAYS` (default 30) after the call ends.

```
eligible transcript → content deleted → status DELETED → audit event
second run          → no-op
```

Deletion is a **conditional state transition** (`READY|FAILED → DELETED`), not
an unconditional write. That is what makes running the job twice, retrying it,
or resuming after a worker restart safe. Nothing assumes a previous attempt
completed.

---

## 16. Error model

Every failure is `{ error: { code, message, requestId } }` with a stable code.
Internal detail never crosses the boundary.

| Status | Codes                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`                                                                                                                                                                       |
| 401    | `AUTHENTICATION_REQUIRED`                                                                                                                                                                |
| 403    | `FORBIDDEN`, `INVITE_REVOKED`, `INVITE_EXPIRED`, `PARTICIPANT_MISMATCH`, `JOIN_WINDOW_NOT_OPEN`, `JOIN_WINDOW_CLOSED`, `CALL_CANCELLED`, `CALL_NOT_JOINABLE`, `TRANSCRIPT_ACCESS_DENIED` |
| 404    | `CALL_NOT_FOUND`, `INVITE_NOT_FOUND`, `RESOURCE_NOT_FOUND`                                                                                                                               |
| 409    | `CONFLICT`, `TRANSCRIPT_NOT_READY`                                                                                                                                                       |
| 422    | `BUSINESS_RULE_FAILURE`                                                                                                                                                                  |
| 429    | `RATE_LIMITED`                                                                                                                                                                           |
| 500    | `INTERNAL_ERROR`                                                                                                                                                                         |
| 503    | `PROVIDER_UNAVAILABLE`                                                                                                                                                                   |

---

## 17. API overview

Full contract with schemas, examples and per-endpoint authorization rules:
[`docs/openapi.yaml`](docs/openapi.yaml).

```
# Auth (Better Auth)
POST   /api/auth/sign-up/email
POST   /api/auth/sign-in/email
POST   /api/auth/sign-out
GET    /api/auth/get-session

# Users
GET    /api/v1/users/me
GET    /api/v1/users/lookup?email=

# Calls
POST   /api/v1/calls
GET    /api/v1/calls
GET    /api/v1/calls/:callId
POST   /api/v1/calls/:callId/cancel
POST   /api/v1/calls/:callId/end
GET    /api/v1/calls/:callId/attendance     # organizer only
GET    /api/v1/calls/:callId/audit          # organizer only
GET    /api/v1/calls/:callId/transcript     # organizer or invited participant

# Invitations
POST   /api/v1/calls/:callId/invitations
GET    /api/v1/calls/:callId/invitations
GET    /api/v1/invitations/:invitationId
POST   /api/v1/invitations/:invitationId/revoke

# Join — the critical path
POST   /api/v1/join/:token/authorize
POST   /api/v1/join/:token/heartbeat
POST   /api/v1/join/:token/leave

# Operations
GET    /health
GET    /ready
```

All list endpoints use **opaque keyset cursors** (`{ items, nextCursor }`)
evaluated at the database. There is no unbounded `findMany`.

---

## 18. Security model

| Control          | Implementation                                                               |
| ---------------- | ---------------------------------------------------------------------------- |
| Authentication   | Better Auth; HttpOnly, SameSite=Lax, Secure-in-production cookies            |
| Authorization    | One central policy module; re-evaluated per request                          |
| Credentials      | Opaque tokens, SHA-256 at rest, never logged                                 |
| CORS             | Explicit origin allowlist with credentials; `*` rejected at boot             |
| Security headers | HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Rate limiting    | Redis-backed per bucket; the join limiter is the tightest                    |
| Auth buckets     | Tight on anything carrying a secret; generous on reading your own session    |
| Input validation | Zod on body, query, params and cursors — before any business logic           |
| Serialization    | Explicit DTOs; `tokenHash` is not a field on any DTO type                    |
| Audit            | Append-only, sanitized metadata, organizer-readable                          |
| Logging          | Pino with a redaction allowlist; join URLs masked in access logs             |

### Never logged or audited

Raw invitation tokens · cookies · `Authorization` headers · passwords ·
provider API keys · transcript content.

---

## 19. Observability

- Structured Pino logs with a `requestId` on every line
- Correlation IDs: an inbound `X-Request-Id` is honoured only when it is short
  and free of control characters, otherwise one is generated — an untrusted
  header cannot inject newlines into logs
- Append-only audit trail (`AuditEvent`)
- Provider call and queue job timings

---

## 20. Testing

```bash
pnpm test              # everything
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm test:concurrency
```

Integration, security and concurrency suites run against a **real PostgreSQL**
— Prisma is not mocked, because the guarantees depend on database constraints
and transactions rather than on TypeScript.

| Suite       | Covers                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| unit        | Window boundaries, interval union, token primitives, state machine, cursors                                        |
| integration | Calls, invitations, join/heartbeat/leave, attendance, transcripts, retention, audit, pagination, provider failures |
| security    | The mandatory access-control matrix (below)                                                                        |
| concurrency | Join/revoke races, duplicate mutations, double retention, final DB state                                           |

### The mandatory security matrix

- Anonymous cannot create a call
- Anonymous cannot join, even with a valid token
- Bob cannot use Alice's invitation
- An uninvited user cannot read the transcript
- An uninvited user cannot read attendance
- Call-ID guessing exposes nothing
- A **revoked invitation cannot be replayed**
- An expired invitation cannot be replayed
- Before-window join denied
- After-window join denied (even with a stale `LIVE` status)
- Cancelled-call join denied

The concurrency suite asserts **final database state**, not just response
codes.

---

## 21. Failure model

| Failure                 | System behaviour                                          |
| ----------------------- | --------------------------------------------------------- |
| Socket.IO down          | Heartbeat still denies revoked participants               |
| Redis down              | Rate limiting fails open; authorization unaffected        |
| Provider down           | `503` on join; no false attendance; invitation untouched  |
| Provider revoke fails   | Access stays revoked; cleanup retries                     |
| Transcript job fails    | Retries with backoff, then `FAILED`; attendance untouched |
| Scheduler delayed       | Window check still denies past the scheduled end          |
| Worker restarts mid-job | Conditional transitions make resumption safe              |

---

## 22. Graceful shutdown

On `SIGTERM`/`SIGINT`: stop accepting connections → let in-flight requests
finish → stop worker consumption → close Socket.IO → close queues → close Redis
→ disconnect Prisma → exit. A 20-second watchdog forces exit if unwinding
stalls. Nothing is killed abruptly.

---

## 23. Production image

Multi-stage build (`base` → `dependencies` → `build` → `production`), runtime
dependencies only in the final layer, running as the unprivileged `node` user,
with a `HEALTHCHECK` against `/health`. Development artifacts, tests and the
TypeScript source are not copied in — only `dist/`.

Corepack resolves pnpm from the `packageManager` field, so the image installs
with the exact pnpm that produced `pnpm-lock.yaml`. Without that pin the build
is not reproducible: a newer pnpm applies lockfile policies that reject an
older lockfile outright.

---

## 24. CI

`.github/workflows/ci.yml`:

```
install → lint → typecheck
        → migration validation (fresh DB + drift check) → seed
        → unit / integration / security / concurrency  (matrix)
        → build + docker image
```

PostgreSQL and Redis run as service containers. Migration validation asserts
that a **fresh** database reaches the current schema purely by replaying
committed migrations, and that no drift remains afterwards.

---

## 25. Demo scenarios

After `pnpm db:seed` (which prints the raw join tokens once):

| #   | Scenario                                 | Expected                           |
| --- | ---------------------------------------- | ---------------------------------- |
| 1   | Alice joins during her window            | `200`                              |
| 2   | Bob replays Alice's token                | `403 PARTICIPANT_MISMATCH`         |
| 3   | Alice tries before the start             | `403 JOIN_WINDOW_NOT_OPEN`         |
| 4   | Organizer revokes mid-call → Alice beats | `403 INVITE_REVOKED`               |
| 5   | Alice replays the exact old token        | `403 INVITE_REVOKED`               |
| 6   | Caption provider fails                   | Call stays active                  |
| 7   | Transcript provider fails                | Queue retries → eventually `READY` |
| 8   | Retention runs twice                     | Second run is a no-op              |

Reset between runs with `pnpm demo:reset`.

---

## 26. Project layout

```
src/
  config/          typed env validation, constants
  app/             Express app, server bootstrap, middleware, routes
  modules/
    access/        ← THE AUTHORIZATION ENGINE
    auth/          Better Auth wiring, server-side session resolution
    users/  calls/  invitations/  attendance/  transcripts/  audit/
    provider/      adapter interfaces + mocks + failure injection
    realtime/      Socket.IO gateway, Redis pub/sub
    retention/     idempotent transcript deletion
  infrastructure/  prisma, redis, queues, logger
  shared/          errors, http, security, time, validation, types
  workers/         worker process and its four queue handlers
prisma/            schema, migrations, seed
tests/             unit · integration · security · concurrency · fixtures
docs/openapi.yaml
```

---

## 27. Scripts

| Script               | Purpose                            |
| -------------------- | ---------------------------------- |
| `pnpm dev`           | API with hot reload                |
| `pnpm dev:worker`    | Worker with hot reload             |
| `pnpm build`         | Generate the client + compile      |
| `pnpm start`         | Run the compiled API               |
| `pnpm worker`        | Run the compiled worker            |
| `pnpm db:seed:prod`  | Seed from compiled output (no tsx) |
| `pnpm lint` / `:fix` | ESLint                             |
| `pnpm typecheck`     | `tsc --noEmit`                     |
| `pnpm test*`         | Vitest suites                      |
| `pnpm db:*`          | Migrate, deploy, seed, reset       |
| `pnpm demo:reset`    | Clean database for a demo run      |
