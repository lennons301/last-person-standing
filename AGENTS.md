# Last Person Standing

## Project Overview

Football survivor picks game — private games where friends pick teams each round, get eliminated if their pick doesn't win, last person standing takes the pot.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.7
- **Database:** Neon (serverless Postgres), local Postgres 17 via Docker for dev
- **ORM:** Drizzle with postgres.js driver
- **Auth:** Better Auth (email + password, database-backed sessions)
- **UI:** shadcn/ui + Tailwind CSS
- **Testing:** Vitest
- **Deployment:** Vercel (lhr1 region) — production: <https://last-person-standing-theta.vercel.app> (live since Phase 4.5, 2026-04-28)

## Commands

```bash
just dev          # Start dev server (requires docker compose up -d first)
just test         # Run tests
just test-watch   # Run tests in watch mode
just lint         # Lint and format with Biome
just typecheck    # Type check with tsc
just build        # Production build
just setup        # First-time setup (install, start db, migrate, seed)
just db-migrate   # Apply Drizzle migrations
just db-seed      # Seed database with dev data
just db-reset     # Reset database (destroy + migrate + seed)
just db-generate  # Generate new migration from schema changes
```

## Project Structure

```
src/
  app/                    # Next.js App Router
    api/auth/[...all]/    # Better Auth handler
  lib/
    auth.ts               # Better Auth server config
    auth-client.ts        # Better Auth client (browser)
    auth-helpers.ts       # getSession(), requireSession()
    db.ts                 # Drizzle client instance
    types.ts              # Inferred types from Drizzle schema
    schema/               # Drizzle schema definitions
      auth.ts             # user, session, account, verification
      competition.ts      # competition, round, fixture, team, team_form
      game.ts             # game, game_player, pick, planned_pick
      payment.ts          # payment, payout
      index.ts            # Re-exports all tables
  proxy.ts                # Next.js 16 route protection
scripts/
  seed.ts                 # Dev seed data
drizzle/                  # Generated migrations
```

## Key Conventions

- **Auth**: Session cached per-request via `getSession()`. Use `requireSession()` in Server Components/Actions that need auth — it redirects to `/login` if unauthenticated.
- **Route protection**: `proxy.ts` (Next.js 16 replacement for middleware) redirects unauthenticated requests. Public paths: `/login`, `/signup`, `/api/auth`.
- **Database**: No RLS — authorization enforced in TypeScript. All IDs are UUIDs. `numeric` columns (entry_fee, amounts) are strings in TypeScript for arbitrary precision.
- **Types**: Inferred from Drizzle schema via `$inferSelect` / `$inferInsert`. See `src/lib/types.ts`.
- **Game modes**: `classic` (one pick per round), `turbo` (10 predictions ranked by confidence), `cup` (like turbo with lives/handicap system).
- **Secrets**: Doppler is the production secrets source. Local dev uses `.env.local` (gitignored).
- **Testing**: Vitest for unit tests. Game logic lives in pure functions for easy testing. Tests run against local Postgres in CI.
- **Linting**: Biome for linting + formatting. Pre-commit hook via husky + lint-staged.
- **Phase completions ride CI/CD from Phase 5 onwards.** Phases 1–4c5 merged dormant to `main` (no pipeline). Phase 4.5 introduced the pipeline and the first real production deploy on 2026-04-28. From Phase 5 onwards, a phase is not "done" until its branch has merged to `main`, CI has passed, and the resulting deployment has landed on production via Vercel's GitHub integration. No manual deploy steps. If a phase's definition of done can't go through the pipeline, the pipeline is what's broken — fix it before declaring the phase complete.

## Environment variables

**Pattern.** `.env.example` (committed) documents every env var the app reads with placeholder values that are sufficient for `pnpm build` and `pnpm test` to succeed. Real values come from one of three places depending on context:

- **Local dev:** `.env.local` (gitignored). Run `just env-init` once to copy from `.env.example`, then replace placeholders for whatever services you actually want to exercise.
- **Production:** Doppler `prd` config → synced automatically to Vercel Production env via the Doppler-Vercel integration. Never set Vercel Production env vars directly; always go via Doppler.
- **Preview:** Doppler `stg` config is the source of truth, but is **not auto-synced** (Doppler free tier caps the workspace at 5 syncs and the slot was sacrificed). After changing any Doppler `stg` value, run `just sync-preview-env` to push the change to Vercel Preview env. See `scripts/sync-preview-env.sh`.
- **GitHub Actions:** repo-level secrets, set via repo settings (separate from Doppler).

If a new env var is added, update `.env.example` AND this list. Routes that read env at module load (e.g., `verifySignatureAppRouter` for QStash) require non-empty placeholder values; that's the whole reason `.env.example` exists.

Variables:
- `DATABASE_URL` — Postgres connection string.
- `BETTER_AUTH_SECRET` — Better Auth session secret.
- `BETTER_AUTH_URL` — app URL used for cookie scope.
- `CRON_SECRET` — shared secret for GitHub Actions and Vercel cron auth.
- `FOOTBALL_DATA_API_KEY` — football-data.org API key (free tier).
- `QSTASH_TOKEN` — Upstash QStash client token.
- `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` — QStash webhook signature verification.
- `VERCEL_URL` — deployment URL used as the QStash callback base. Populated automatically in Vercel builds; set manually in dev if you want to exercise QStash locally.
- `NEXT_PUBLIC_APP_URL` — public origin of the deployed app. Used by the Better Auth client (`src/lib/auth-client.ts`) as its `baseURL`. **Must match the deployed URL exactly** so the browser can reach `/api/auth/*`. As a `NEXT_PUBLIC_*` var, it's bundled into the client at build time — changing it requires a redeploy.

GitHub Actions secrets (repo-level):
- `CRON_SECRET` — same value as Doppler `prd.CRON_SECRET`. Used by `live-scores.yml` for the every-minute poll.
- `VERCEL_PROD_URL` — full https URL of the Vercel production deployment. Used by `live-scores.yml` as the request target.
- `PROD_DATABASE_URL` — same value as Doppler `prd.DATABASE_URL`. Used by `migrate.yml` to apply Drizzle migrations on push to `main`. Duplicated from Doppler intentionally; revisit if rotation cadence increases.

## Platform Context

Platform standards and choices: see ~/code/platform/
This project's registry entry: products/last-person-standing.yaml
