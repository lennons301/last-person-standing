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
- **Deployment:** Vercel (lhr1 region)

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
- **Phase completions ride CI/CD from Phase 5 onwards.** Phases 1–4a have already merged to `main` without any pipeline; Phases 4b and 4c will do the same. Phase 4.5 is the big-bang launch that introduces the pipeline and does the first real deploys. From Phase 5 onwards, a phase is not "done" until its branch has merged to `main`, CI has passed, and the resulting deployment has landed on staging and production via Vercel's GitHub integration. No manual deploy steps. If a phase's definition of done can't go through the pipeline, the pipeline is what's broken — fix it before declaring the phase complete.

## Environment variables

**Pattern.** `.env.example` (committed) documents every env var the app reads with placeholder values that are sufficient for `pnpm build` and `pnpm test` to succeed. Real values come from one of three places depending on context:

- **Local dev:** `.env.local` (gitignored). Run `just env-init` once to copy from `.env.example`, then replace placeholders for whatever services you actually want to exercise.
- **Production / preview:** Doppler is the source of truth → synced to Vercel project env. Never set Vercel env vars directly; always go via Doppler.
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

GitHub Actions secrets (repo-level):
- `CRON_SECRET` — same value as above.
- `VERCEL_PROD_URL` — full https URL of the Vercel production deployment.

## Platform Context

Platform standards and choices: see ~/code/platform/
This project's registry entry: products/last-person-standing.yaml
