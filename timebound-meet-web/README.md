# Sync — React frontend

> **Naming:** the product is **Sync**. "TimeBound" was the internal working
> name and survives only in directory and package names — it must never appear
> in anything a user reads.

A standalone React SPA for the Sync backend. It is a thin, typed
client: **the backend is the security boundary, this application is the
experience layer.**

## Running it

The backend must be running first (default `http://localhost:4000`, with
`FRONTEND_ORIGIN=http://localhost:5173` so credentialed CORS allows this app).

```bash
pnpm install
cp .env.example .env     # adjust VITE_API_BASE_URL if the backend is elsewhere
pnpm dev                 # http://localhost:5173
```

Demo accounts come from the backend seed (`pnpm db:seed` there):
`organizer@example.com`, `alice@example.com`, `bob@example.com`,
`carol@example.com` — password `TimeBoundDemo123!`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server on port 5173 |
| `pnpm build` | Typecheck, then a production bundle in `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm typecheck` | TypeScript only |
| `pnpm test` | Vitest + React Testing Library (112 tests) |

## How it is put together

```
React UI → Pages → Feature components → Hooks → TanStack Query → API client → Express
                                                Socket.IO client → Realtime service → React state
```

```
src/
├── app/         router, providers, query client + keys
├── pages/       one component per route
├── features/    auth, calls, invitations, attendance, transcript, join, captions, audit
├── components/  ui (shadcn-style), layout, call, common state components
└── lib/         api, realtime, errors, theme, toast, date, config
```

### Routes

| Route | Access | What it is |
| --- | --- | --- |
| `/` | public | Landing page — what the product does and why |
| `/login`, `/signup` | public | Split-panel auth; sign-up establishes a session immediately |
| `/dashboard` | signed in | Live / next up / past / invited, with counters |
| `/invitations` | signed in | "You have been invited to these", with a way straight in |
| `/calls/new` | signed in | Schedule a call |
| `/calls/:id` | signed in | Organizer console, or the participant's view of the same call |
| `/calls/:id/transcript`, `/calls/:id/audit` | signed in | Full-page views |
| `/join/:token` | signed in | Resolves an invitation link, then the lobby |
| `/call/:id/lobby` | signed in | Device check — the only way into a room |
| `/call/:id` | signed in | The active call |

A signed-out visitor sent to a protected route keeps their destination through
sign-in *and* sign-up, so an invited participant with no account can create one
and land back on their join link.

- **`lib/api`** is the only place that talks to the backend. Components never
  call `fetch` directly. `types.ts` mirrors the backend DTOs by hand; replace it
  with generated types if the backend publishes OpenAPI.
- **TanStack Query owns server state.** React state covers modals, forms and
  the local mic/camera toggles. There is no global store.
- **`lib/errors`** turns every failure into one `ApiError` and maps each backend
  code to user-facing copy, keeping the `requestId` for support.

### Two error envelopes

The backend speaks two of them, and the client understands both:

```jsonc
// /api/v1/*
{ "error": { "code": "INVITE_REVOKED", "message": "…", "requestId": "req_1" } }
// /api/auth/*  (Better Auth)
{ "message": "Invalid email or password", "code": "INVALID_EMAIL_OR_PASSWORD" }
```

Where the backend writes copy that is both safe and specific — business rules,
conflicts, field validation — that message is shown verbatim, because it knows
why the request failed and the frontend does not. Security codes keep their
mapped copy regardless, so no server string can weaken them.

### Ordering and pagination

`GET /calls` always orders `scheduledStart DESC`. For future-facing lists that
puts the furthest-out call first, so the dashboard bounds "Next up" to a 30-day
window and sorts it ascending for display. Every list — calls, invitations,
attendance, audit — pages through the backend's opaque `nextCursor` behind a
**Load more** control; nothing reads an unbounded history.

## Getting into a call

Two doors, one decision. The organizer is never issued an invitation to their
own call, so ownership is a door of its own; an invitee who is signed in does
not need to hunt for the email. Both reach the same authorization check.

```
  invitation link                      signed in
        |                                  |
  POST /join/:token/resolve        GET /calls/:id
  (authorizes, records nothing)           |
        |                                 |
        +---------> /call/:id/lobby <-----+
                    device check,
                    nothing recorded yet
                          |
        POST /join/:token/authorize   POST /calls/:id/join
                          |
                      /call/:id
```

**What gates entry is holding a live invitation, not the clock.** Arriving
before the scheduled start is allowed — you go in and wait, as you would walk
into a meeting room early. The end of the window still closes the room, and so
does the organizer ending the call for everyone.

Nothing is recorded until the person commits from the lobby: `resolve` is
read-only, so a device check costs no attendance row and no provider session.

The local self-view is a real camera stream. Remote participants are
placeholder tiles until a provider adapter is connected — a fake remote video
would be a lie, so the distinction stays visible.

## Voice

The interface talks to a person, not to a spec. Three rules:

1. **Say what someone can do, never why the system works that way.** The user
   does not need to know that the invitation is the gate rather than the
   clock — they need to know they can go in early.
2. **Contractions and short sentences.** "You're a bit early" beats "This call
   has not yet reached its scheduled start time."
3. **Bad news gets a plain sentence and a next step**, never a lecture.
   "The host took you off the guest list." Then a way onward.

```
✗  This call starts in 15 minutes. You can go in now and wait —
   your invitation is what lets you in, not the clock.

✓  You're a bit early — it starts in 15 minutes. Go on in and
   make yourself comfortable.
```

Vocabulary: a **meeting** is what users have; a **call** is the object in the
API. The person who set it up is the **host** (`organizerId` in the data).
Taking an invite back is "taking it back", not "revoking" — the code says
revoke, the interface does not.

## Timezones

A meeting is scheduled at a **wall-clock time in a place** — "14:00 in New
York" — and the API stores the instant that refers to, in UTC. Converting
between the two is the entire job of `lib/date/timezone.ts`, and it must never
be done by hand:

```js
new Date('2026-10-03T14:00')   // reads the string in the BROWSER's zone
```

A host in Mumbai scheduling a New York meeting that way books it **nine and a
half hours early**, with a timezone field that looks like it worked. The form
therefore resolves entered times through `zonedInputToIso(value, timeZone)`,
which is DST-aware down to the day a zone changes its clocks.

Display runs the other way: times are shown in the **viewer's** zone, and the
meeting's own zone is mentioned only when it is a different clock — compared by
current offset, so nobody in London is told what time it is in London.

The picker offers only zones the browser knows, each with its current offset,
and always includes the viewer's own zone even when the browser reports it
under a legacy alias (`Asia/Calcutta` for `Asia/Kolkata`).

## Nothing pulls you out of a call

Navigating away from `/call/:id` unmounts the room, which stops the camera and
closes every peer connection — so any in-call action that needed another page
would quietly end the meeting for whoever took it.

Everything a host needs mid-call therefore lives in the People panel:

| Action | Where |
| --- | --- |
| Invite someone | People panel → **Invite**, join link shown in place |
| Remove someone mid-call | **Remove** beside them in the call |
| Take back an invite before they arrive | **Uninvite** under "Invited" |
| See who is here and on how many devices | People panel |
| See who joined and left | Activity panel |

The guest list is fetched only when the viewer is the host, so a participant's
browser never even asks for the organizer-only list.

## The security model, as the UI expresses it

The backend decides authorization; nothing here re-implements those rules.

- **Route guards are UX only.** `ProtectedRoute` keeps signed-out users out of
  an empty shell. It grants nothing — every request behind it is authorized
  again server-side.
- **The join page makes no judgement.** It does not inspect the token, compare
  timestamps or check call status. It shows "checking access…", calls
  `POST /join/:token/authorize`, and renders the backend's answer — including
  the specific denial (revoked, expired, not yet open, ended, wrong participant).
- **Session credentials stay in memory.** The raw invitation token and the
  provider session descriptor live in React state for the duration of the call
  and are never written to `localStorage`, `sessionStorage` or a cookie. A
  refresh legitimately loses them and the participant re-authorizes.
  The Better Auth session itself is an HttpOnly cookie the app never reads.
- **Four independent ways a call ends, any one sufficient:** a realtime event,
  a denied heartbeat, the participant leaving, or the organizer ending it for
  everyone. Leaving on your own terms redirects you to the call; being removed
  gets a screen that says why, because you know the first and not the second.
- **Signing out clears local state only once the server confirms it.** The
  session cookie is HttpOnly, so only the server can end it — showing a
  signed-out interface over a live session would be the one lie this product
  cannot afford. A failed sign-out says so and stays signed in. Realtime is the fastest path,
  never the authority — with the socket down, the heartbeat still tears the call
  down within one interval (`VITE_HEARTBEAT_INTERVAL_SECONDS`, default 30s,
  against the backend's 90s timeout).
- **The call timer is informational.** Nothing gates on it.
- **Caption failures never end a meeting.** A failed or unsupported
  transcriber shows an explanation in the panel and nothing else changes.
- **The roster shows names, not contact details.** Everyone in the room sees
  who else is in it — display name, arrival time, device count — because that
  is ordinary. Emails, device identifiers and session internals are not
  returned by the endpoint, so they cannot be rendered.
- **Nothing internal is rendered** — no token hashes, provider secrets, stack
  traces or unnecessary database identifiers. Audit metadata is allowlisted.

## Backend contract this app depends on

Only the HTTP DTOs and the Socket.IO events — never Prisma models, the database
schema, Redis, BullMQ or backend service classes.

```
POST   /api/auth/sign-up/email          POST /api/v1/calls/:id/invitations
POST   /api/auth/sign-in/email          GET  /api/v1/calls/:id/invitations
POST   /api/auth/sign-out               POST /api/v1/invitations/:id/revoke
GET    /api/auth/get-session

GET    /api/v1/users/me                 POST /api/v1/join/:token/authorize
GET    /api/v1/users/lookup?email=      POST /api/v1/join/:token/heartbeat
                                        POST /api/v1/join/:token/leave
POST   /api/v1/calls                    POST /api/v1/join/:token/resolve
GET    /api/v1/calls                    GET  /api/v1/invitations/mine
GET    /api/v1/calls/:id
POST   /api/v1/calls/:id/cancel         GET  /api/v1/calls/:id/attendance
POST   /api/v1/calls/:id/end            GET  /api/v1/calls/:id/transcript
                                        GET  /api/v1/calls/:id/audit
POST   /api/v1/calls/:id/join           GET  /api/v1/calls/:id/participants
POST   /api/v1/calls/:id/heartbeat
POST   /api/v1/calls/:id/leave
```

Socket.IO at `VITE_REALTIME_PATH` (`/realtime`), authenticated by the session
cookie. The client emits `call:subscribe` / `call:unsubscribe`; the server
decides room membership and the subscribe ack reports who is already there.

| Direction | Events |
| --- | --- |
| Server → client | `INVITATION_REVOKED`, `CALL_ENDED`, `FORCED_DISCONNECT`, `CAPTION_STATUS_CHANGED`, `PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`, `webrtc:peer-joined`, `webrtc:peer-left` |
| Both ways | `webrtc:signal` (SDP/ICE, relayed), `captions:utterance` (text, relayed) |

Successful `v1` responses are `{ data }`; lists are `{ items, nextCursor }`
(keyset pagination); failures are
`{ error: { code, message, requestId, details? } }`.

## Media

Audio and video travel **browser to browser** over a WebRTC full mesh. No
media passes through this application's servers, which only introduce the
peers to each other.

```
Alice's browser                               Bob's browser
      |                                              |
      |  1. call:subscribe  ──► server authorizes ──►|
      |     (ack lists who is already in the room)   |
      |                                              |
      |  2. offer / answer / ICE, relayed by the     |
      |     server between two sockets it has        |
      |     confirmed are in the same call room      |
      |                                              |
      |  3. ═══════ audio + video, direct ══════════ |
```

The server relays only SDP and ICE, and it **stamps the sender itself** — a
client cannot forge who a signal came from, nor relay to a socket outside the
call room. Both are enforced in `realtime.gateway.ts`.

- **`features/call-media/use-webrtc-mesh.ts`** holds one `RTCPeerConnection`
  per peer. The established peer offers to the newcomer, and a polite/impolite
  rule resolves the case where two offers cross.
- **Public STUN only, no TURN.** That covers most home and mobile networks but
  not symmetric NATs or strict corporate firewalls. Those peers surface as
  "Could not connect" rather than as a silently black tile.
- **A mesh, not an SFU.** Each browser uploads its camera once per other
  participant, so cost grows with the square of the room. Past `MESH_LIMIT`
  (6) the UI says so. Going further needs a media server.
- Mute and camera toggle `track.enabled`, so they take effect without
  renegotiating. A denied camera never blocks joining.

### Live captions and the transcript

The transcript is **the captions, kept**. Each settled line is stored against
the call with its speaker and the moment it was said; when the call ends, they
are assembled in order into the write-up. Interim guesses are never stored —
they change as someone finishes a sentence, so writing them down would record
every half-formed thought.

This has one consequence worth stating plainly: **a call where nobody turned
captions on produces no transcript**, and says so. It does not invent
plausible dialogue. (`TRANSCRIPTION_MODE=mock` still returns fixed sample
text, and exists only so tests can exercise the pipeline without anyone
speaking.)

### How captions work

Each participant's browser transcribes **its own microphone** via the Web
Speech API and publishes the text; the server relays it and attributes it from
the session, so nobody can put words in someone else's mouth. Captions are
off until a participant turns them on, because in Chrome this API sends
microphone audio to Google for recognition — the panel says so while it is
running. Browsers without the API say so plainly instead of failing silently.

## Deploying

`pnpm build` emits static assets to `dist/`. Serve them from any web server or
CDN with an **SPA fallback** so `/dashboard`, `/calls/:id` and `/join/:token`
resolve to `index.html`. Set `VITE_API_BASE_URL` at build time, and make sure
the backend's `FRONTEND_ORIGIN` and `JOIN_URL_BASE` point at the deployed
origin. Nothing secret belongs in a `VITE_*` variable — it is all public.
