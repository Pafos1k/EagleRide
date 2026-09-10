# EagleRide

React/Vite frontend with an Express server for the existing Gemini endpoints.
Create/list/detail ride flows use PostgreSQL. Other screens retain their existing
mock/local behavior. Authentication is not implemented.

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

## Stage 2: PostgreSQL ride storage

Core create/list/detail flows now use PostgreSQL through Express. Install PostgreSQL
18 locally (or use a PostgreSQL 18 service), create an `eagleride` database and a
login role, and set `DATABASE_URL` in `.env`. The example password is a placeholder.
Keep the service private: every request currently acts as Baldwin (`u1`), with no
sign-in or access controls. A second browser is a separate client, not a separate
user identity in this stage.

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

No authentication, chat storage, join/leave API, notifications, reputation,
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
before retrying. Listings are currently unpaginated; identity is fixed; estimates
are client-provided; the temporary user ID is duplicated in the seed/server and
must be replaced in a later authentication stage. Database changes have no realtime
updates; reload/navigate to retrieve the latest data.
