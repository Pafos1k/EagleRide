# EagleRide

React/Vite frontend with an Express server for the existing Gemini endpoints.
Create/list/detail ride flows use PostgreSQL. Activity and ride operations also use PostgreSQL as of Stage 4. Stage 3 adds Supabase Google authentication and persistent user identity.

## Requirements and development

Use Node 24 (`nvm use`) and npm 10.9.4. Node 22.12+ is also supported.
npm is the only package manager; commit package-lock.json with dependency changes.

```sh
npm ci
cp .env.example .env
npm run dev
```

The local port defaults to 3000; set `PORT` to override it. `.env` is loaded from
the working directory without overriding existing environment variables.
`GEMINI_API_KEY` is optional; the existing `API_KEY` fallback remains supported.
Never use a `VITE_` prefix for secrets: those values are exposed to browser code.
Local environment files are ignored; only `.env.example` is tracked.

## Build and verification

```sh
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

The server tests exercise the actual production bundle, health endpoint, static
assets, missing resources, JSON body limits, PORT configuration, and existing
Gemini no-key fallbacks. Browser tests smoke-test all current routes and mobile
navigation. Tests do not use Gemini credentials or modify ride behavior.

## Production

```sh
npm ci
npm run build
npm ci --omit=dev
npm test
npm start
```

Builds require development dependencies. The built server does not require Vite,
tsx, TypeScript, or esbuild at runtime. `npm start` and `npm run preview` both run
the production Express server, including the API endpoints.

- `dist/client/`: the only publicly served directory.
- `dist/server/server.mjs` and its source map: private server output.
- The build hardwires production middleware selection; it cannot accidentally
  enable Vite through an inherited NODE_ENV. The built entry also sets
  NODE_ENV=production for runtime dependencies.
- HashRouter routes use `/#/...`; unknown asset/API paths return 404.
- `public/` contains the existing root image URLs; Tailwind 3 is compiled locally.
- Google Fonts and Google Maps remain external resources as before.

CI repeats installation, typechecking, build, server and Chromium smoke tests,
then reinstalls production-only dependencies and reruns the server tests.

## Stage 2: PostgreSQL ride storage (historical scope; Stage 4 updates below)

Core create/list/detail flows now use PostgreSQL through Express. Install PostgreSQL
18 locally (or use a PostgreSQL 18 service), create an `eagleride` database and a
login role, and set `DATABASE_URL` in `.env`. The example password is a placeholder.
Keep PostgreSQL private. Stage 3 now requires a verified BC Supabase session for
ride creation; public ride browsing remains available. The legacy `u1` seed remains
for historical records only.

```sh
npm ci
npm run typecheck
npm run build
npm run db:migrate
npm start
```

Migrations are explicit, ordered SQL files in `server/migrations`. The built
migration command works with production-only dependencies. It applies pending SQL
and the seed user in one transaction, locks concurrent migration runs, and records
checksums in `schema_migrations`. Do not edit applied migrations; add a new numbered
SQL file. Back up real data before applying later migrations. No automatic startup
migration, down migration, or localStorage data import is provided.

The three domain tables are:

- `users`: text ID, name, unique BC email, server-generated creation timestamp.
  Seeded `u1` matches `CURRENT_USER`; mock reputation/phone fields are not persisted.
- `rides`: generated UUID; host FK; separate origin/destination names, nullable
  addresses and terminals; departure `timestamptz`; capacity 1–4 including the host;
  luggage/flexibility values; nonnegative integer estimated fare cents (maximum
  1,000,000); nullable note; server-generated creation timestamp.
- `ride_participants`: generated UUID, ride/user FKs, unique `(ride_id, user_id)`,
  server-generated join timestamp. Occupancy is derived from these records.

`schema_migrations` is migration metadata, not an additional product/domain table.
Terminals A/B/C/E are stored on the applicable endpoint, so Logan → BC retains the
airport origin. Free-text location names are preserved, with nullable addresses;
there is no geocoding or normalized location database. The destination dropdown
filters the exact preset names. Free-text destinations appear under All Destinations.

### API

- `GET /api/rides`: 200 array sorted by departure and ID; empty array when empty.
- `GET /api/rides/:id`: 200 ride with participants; 404 for unknown/malformed ID.
- `POST /api/rides`: 201 ride and Location header; 400 for invalid input or unknown
  fields, including client-supplied ownership, occupancy, timestamps or IDs.

Example creation body:

```json
{
  "origin": {"name": "Boston College", "address": "140 Commonwealth Ave, Chestnut Hill, MA", "terminal": null},
  "destination": {"name": "Logan Airport (BOS)", "address": "Logan International Airport, Boston, MA", "terminal": "C"},
  "departureTime": "2030-01-01T12:00:00-05:00",
  "seatsTotal": 4,
  "luggageType": "ONE_SUITCASE",
  "flexibility": "PLUS_MINUS_30",
  "estimatedTotalCostCents": 5400,
  "hostNote": null
}
```

Departure requires an ISO timestamp with a timezone offset (or Z), is stored as
`timestamptz`, and is returned in UTC. The existing date picker still interprets
wall time in the browser's timezone. The API accepts past departures; lifecycle
rules are deferred. Fare is a validated client estimate, not a quote or payment;
the stored cents are authoritative for displayed totals on ride detail. The
existing heuristic estimator remains unchanged.

The server creates the ride and host participant on the same connection within
one transaction. SQL uses parameters. Missing configuration/database failures
return 503 for rides without exposing credentials or SQL. Stage 1 health and Gemini
fallback routes remain usable without PostgreSQL; health is liveness, not DB readiness.

### Verification

```sh
npm ci
npm run typecheck
npm run build
npm test
# This connection must have CREATEDB permission. Never use a production admin role.
TEST_DATABASE_URL=postgresql://eagleride:local_password@127.0.0.1:5432/postgres npm run test:db
# Browser tests require a disposable, migrated DATABASE_URL database and Chromium.
npm run db:migrate
npx playwright install chromium
npm run test:ui
npm ci --omit=dev
npm test
TEST_DATABASE_URL=postgresql://eagleride:local_password@127.0.0.1:5432/postgres npm run test:db
```

Database tests create their own uniquely named database, migrate it, run the actual
built HTTP server, and drop only that database afterward. They test atomic rollback
using a temporary failing participant trigger, separate clients, restart persistence,
constraints and bidirectional location round-trips. No tests silently substitute an
in-memory mock. CI supplies PostgreSQL and runs these checks and Chromium tests.
Browser tests create records in their configured database; use a disposable database.

### Explicit stage boundaries and debt

No chat storage, join/leave API, notifications, reputation,
background jobs, lifecycle automation or Gemini changes are included. Create,
Find Rides and Ride Detail no longer read/write `er_rides` or `er_participants`.
The legacy store, dashboard/activity, chat screen and decorative HeroPhone remain
mock/local; they do not show newly persisted rides. No second local copy of new API
rides is written. Existing mock data is not migrated or deleted.

Local-only join/delete actions in migrated screens are unavailable; similar rides
link to their detail instead. The new ride detail does not link persistent IDs into
the legacy mock chat. These boundaries prevent false success and inconsistent local
writes; they do not implement joining, deleting or chat.

Creation has **no idempotency key or duplicate-retry protection**. The UI prevents
concurrent clicks, but an uncertain network outcome requires checking Find Rides
before retrying. Listings are currently unpaginated and estimates
are client-provided. New ride ownership uses the authenticated application user. Database changes have no realtime
updates; reload/navigate to retrieve the latest data.


## Stage 3: authentication and persistent identity (Stage 4 updates below)

Express owns the Google OAuth PKCE flow through Supabase Auth. The browser calls
same-origin Express endpoints and never receives session tokens in JSON, JavaScript
state, or localStorage. `@supabase/supabase-js` runs on the server with a publishable
key; no service-role key, `express-session`, session table, or `SESSION_SECRET` is used.
The test-only HTTP provider lives under `tests/helpers`; production has no mock login
route, test identity switch, or authentication bypass.

### Session handling

- `POST /api/auth/login` starts Google sign-in and returns an authorization URL.
  The PKCE verifier lives in host-only `er-pkce.*` HttpOnly cookies for ten minutes.
- `GET /api/auth/callback` exchanges the one-use code with the browser's verifier,
  calls Supabase `getUser(accessToken)`, enforces a verified BC email, synchronizes
  the application user, then redirects to `/#/profile`. Failures return a fixed error
  code in `/#/signin`; no token or provider error detail appears in the redirect.
- Only Supabase `access_token`, `refresh_token`, and `expires_at` are stored in chunked
  `er-auth.*` HttpOnly cookies. They are host-only, Path=/, SameSite=Lax and Secure
  on HTTPS; HTTP is allowed only on loopback for local development. Cookie lifetime
  is capped at 30 days per write; Supabase session policy remains authoritative.
  Google provider access/refresh tokens are discarded and never persisted.
- Each protected request uses a request-scoped client, explicitly refreshes when
  expiry is within 30 seconds, writes rotated cookies, and calls `getUser` to validate
  identity remotely. The cookie's user claims are never trusted. Invalid credentials
  fail closed; transient provider failures return 503 without discarding recoverable
  cookies. There is no browser SDK or background refresh timer.
- `GET /api/auth/me` and `GET /api/auth/profile` return only application ID, name,
  BC email and creation timestamp. These are current-user endpoints; arbitrary user
  profile retrieval/modification is not implemented.
- `POST /api/auth/logout` requests Supabase sign-out with `scope=local` and clears
  both cookie families even if remote revocation fails. A failure is surfaced to
  the UI with a retry action. It never calls Google token revocation.
- `POST /api/rides` now requires the server-validated user and derives the host and
  initial participant from that application ID. Ownership/identity input fields
  remain rejected. GET ride listing/detail remain public.

All POST auth/ride mutations require an Origin header exactly matching APP_ORIGIN;
missing or cross-origin values are rejected. Auth responses use private, no-store.
Keep frontend and API on the same origin; do not enable permissive credentialed CORS.
The server splits email at exactly one `@`, rejects empty local parts/whitespace,
and compares the entire domain case-insensitively to `bc.edu`. This verifies mailbox
ownership only, not current student enrollment. The Google `hd` hint is not trusted.

### Migration

`002_auth.sql` adds nullable unique UUID `users.auth_subject` and
`users.email_verified_at`. Auth-linked rows must have a verified timestamp and exact
BC email domain. Existing `001` history, seeded `u1`, rides and foreign keys are
preserved. Login upserts by verified Supabase subject, never by email alone. An
email collision with another identity (including a legacy row) returns 409; it does
not silently transfer historical ownership. No token or session storage is added.

### Manual Supabase / Google setup

1. Create/select a Supabase project. Copy its HTTPS project URL and publishable key
   into server-only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env`.
2. In Google Cloud, configure the OAuth consent screen and a Web application OAuth
   client. While the app is in Testing, add the BC test accounts as test users.
3. Enable Google under Supabase Authentication → Providers. Put the Google client
   ID and secret in that dashboard, not frontend code. Use the exact Supabase
   callback URL shown there as Google's authorized redirect URI (normally
   `https://<project-ref>.supabase.co/auth/v1/callback`). Add your app origin to
   Google's authorized JavaScript origins where required.
4. Set Supabase Auth Site URL to `http://localhost:3000` locally and allow redirect
   `http://localhost:3000/api/auth/callback`. Set `APP_ORIGIN=http://localhost:3000`.
   Use this hostname consistently; `127.0.0.1` is a different origin. In production,
   use the actual HTTPS origin and its exact callback URL in both settings.
5. Set DATABASE_URL, build, and run `npm run db:migrate` before starting the app.
   Never put Supabase or database configuration in `VITE_*` variables.
6. Manually verify a BC login, rejected non-BC login, reload, ride host identity,
   expiry/refresh, and logout against the real project. Automated tests do not prove
   live Google/Supabase configuration works. No live credentials are included.

Run the same verification commands above. `npm run test:db` includes real-PostgreSQL
auth integration tests using an isolated HTTP Supabase fixture. Playwright's server
wrapper uses the same fixture and a disposable, migrated DATABASE_URL database;
CI does not depend on live OAuth credentials. A sandbox that prevents Chromium from
launching cannot execute browser assertions; report this separately from test failures.

### Security limitations and remaining debt

- Supabase access JWTs can remain valid until expiry after logout; there is no
  application JWT denylist or immediate access-token invalidation. Local logout
  revokes only that Supabase session, not every device or the Google account.
- If Supabase revocation fails, browser cookies are still cleared but a copied
  refresh token may remain usable. If the browser cannot reach Express, cookie
  clearing cannot be confirmed; the UI reports failure and offers retry.
- Concurrent requests/tabs can race refresh-cookie writes. This design relies on
  Supabase's refresh-token reuse handling; persistent conflicts require signing in
  again. No cross-process session lock or custom session service is added.
- HttpOnly protects token reads from JavaScript, not authenticated requests made
  by an XSS payload. Deploy with HTTPS, protect the host, and retain secure provider
  configuration. No app-level auth rate limiter is added in this stage.
- Display names come from provider metadata and are presentation only. Identity
  is the verified Supabase subject and email. BC restriction is enforced by Express;
  rejected non-BC users may still exist in Supabase Auth itself.
- Public ride responses continue exposing host/participant IDs as in
  Stage 2. Profile email is only returned to the authenticated user.
- Activity/dashboard, chat and decorative mock UI remain unchanged and can still
  show Baldwin/demo data. They do not represent the authenticated user's history.
  Profile now shows real identity without invented reputation/statistics.
- No join/leave, Activity migration, chat backend, notifications, reputation,
  Gemini behavior, enrollment verification or later-stage features are implemented.


## Stage 4: public browsing, Activity and ride operations

Home (/#/), the Request a Ride form, Find Rides, Ride Details, and About are public.
Continuing/submitting the request, Activity, Profile, ride mutations and chat entry
require sign-in. Public discovery excludes cancelled rides; their records remain
available in ride details and personal Cancelled Activity. A protected action redirects
to sign-in with a validated in-app return path; optional sessionStorage holds only
that navigation path across OAuth. Joining still requires a deliberate Join click
after return (it never auto-joins during a callback). Chat routes now explicitly
say unavailable instead of showing a local conversation. Editing remains unavailable.

### Migration and membership

Run the normal build and npm run db:migrate before starting Stage 4. New migration
003_ride_operations.sql adds nullable rides.cancelled_at and
ride_participants.left_at, plus an index for active user memberships. Existing
rows are active by default; migration history and historical records are preserved.
No duplicate occupancy column is added: API seatsTaken is derived from rows whose
left_at is null, while seats_total remains ride capacity (including the host).

Leave marks a membership inactive without deleting it. Rejoin reactivates the same
unique (ride_id, user_id) row and updates joined_at; this is not a full membership
event log. Cancellation marks the ride, retains memberships, and cannot be undone
in this stage. Cancelled membership counts represent the preserved group, not an
available booking. Old seeded users are not used to identify the current user.

### New API endpoints

- GET /api/rides/mine: authenticated current-user Activity, private/no-store.
  Includes hosted rides and current participant memberships, with role
  (host/participant) and category (upcoming/past/cancelled). Left memberships
  are excluded from Activity. Cancellation takes precedence over departure; past means departure
  at or before the server's current time. Others' rides are excluded.
- POST /api/rides/:id/join: authenticates the caller and checks existence, future
  departure, cancellation, host/duplicate membership, and active capacity.
- POST /api/rides/:id/leave: non-host only. Marks an existing active membership
  left; a repeated completed leave returns success. Never-members are rejected.
  Active membership on a cancelled ride stays historical and cannot be left.
  Leaving a past ride is allowed; no additional lifecycle system is introduced.
- POST /api/rides/:id/cancel: host only; sets cancelled_at once, preserving history.
  Repeated cancellation returns success. Hosts can cancel past rides as well;
  automatic lifecycle transitions are not implemented.

Mutations accept no identity or ride-edit fields (an empty body or empty JSON object
is accepted), require the existing same-origin check, and return the updated ride.
Unknown IDs return 404, authorization failures 401/403, invalid bodies 400, and
membership/capacity/lifecycle conflicts 409. Public list/detail GET routes are
unchanged in access policy. Listings retain past/cancelled records with clear labels.

### Concurrency

Every join, leave and cancel runs in a PostgreSQL transaction and first locks the
ride row with SELECT ... FOR UPDATE. Capacity and state are read only after acquiring
that lock; at READ COMMITTED, a waiting join sees the preceding commit. Departure is
checked with PostgreSQL clock_timestamp after the lock, not transaction-start time.
The existing unique (ride_id,user_id) constraint remains. No in-memory mutex is used.
This coordinates the application API's writers across processes. Any future direct
SQL membership writer or capacity-edit operation must follow the same locking rule.

The last-seat test holds the ride lock externally, confirms that both API requests
are waiting on PostgreSQL locks, releases it, and asserts exactly one 200 and one
409 with the active count equal to capacity.

### UI and scope

Activity now reads only the current-user API, with Upcoming, Past and Cancelled
sections and Hosted/Joined labels. It refreshes on window focus so cancellations
made in another tab appear when returning to Activity. It never imports mock ride data or reads
er_rides / er_participants. Read errors are explicit and can be retried.

Ride Detail offers real Join, Leave and Cancel actions, refreshed state and conflict
errors. Find Rides links to that operation screen and labels past, cancelled and
full rides. Fare estimates remain approximate. Create and Detail no longer display
static travel-time/distance ranges or a purported live surge indicator; users can
choose “Check live route in Google Maps.” The fare algorithm itself is unchanged.
No Google Maps Routes API is used.

Tests remain npm test, npm run test:db, and npm run test:ui. The browser fixture
runs Supabase on loopback port 3101 and the app on 3100 with a disposable migrated
database; the test-only user selector exists in the fixture only, never production.
Browser coverage checks public access, safe return navigation, PostgreSQL operations,
Activity ignoring poisoned localStorage, cancellation and existing auth behavior.

No chat backend, Socket.IO, notifications, reputation, payments, full lifecycle
automation, Gemini/recommendation changes, admin tools or microservices were added.
There is no realtime subscription, pagination, ride-edit API, cancellation undo,
or per-operation audit log. Existing auth limitations and create idempotency debt
remain. Apply migration 003 to the real application database before running this
branch there; test migrations alone do not update it.

## Stage 5: persistent ride chat

Migration 004_ride_messages.sql adds messages with database-generated ordered IDs,
ride and sender foreign keys, body (1–2000 characters), server timestamps, and a
ride/order index. Existing migrations are unchanged. Apply the migration to the
application database before using chat.

GET /api/rides/:id/messages and POST /api/rides/:id/messages require a verified
session and current participation (including the host). POST accepts only body;
sender identity comes from Express authentication. Both operations lock the ride
row using the same protocol as leave/cancel. Cancelled rides preserve readable
history for current participants but reject new messages. Former participants and
outsiders cannot read or send. Responses are private/no-store; writes require the
existing same-origin checks. Message IDs provide stable per-ride insertion order.

The existing chat layout now displays persisted messages and real sender names,
with loading, empty, retry, and send-error states. Refresh chat manually to see
messages from others. There are no seeded messages, browser chat storage, sockets,
typing indicators, receipts, attachments, reactions, or notifications. The API
remains authoritative if membership or cancellation changes while a tab is open.
History is currently returned in full; pagination and send idempotency are not
implemented. After an ambiguous network failure, refresh before manually retrying
a send. No changes to Gemini, reputation, payments, or unrelated UI.
