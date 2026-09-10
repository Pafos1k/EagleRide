# EagleRide

React/Vite frontend with an Express server for the existing Gemini endpoints.
Ride data still uses browser localStorage; this infrastructure change does not
add real users, shared persistence, or new ride behavior.

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
