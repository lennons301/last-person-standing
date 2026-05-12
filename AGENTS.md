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

## PL season rollover (annual ritual)

Every August, the Premier League season changes — 3 promoted teams replace 3 relegated ones. Bootstrap merges FPL data with football-data IDs by `short_name === tla`, plus an alias map `FPL_TO_FD_TLA` in `src/lib/game/bootstrap-competitions.ts` for the rare cases where the two sources disagree on a team's 3-letter code. (As of 2025/26: only Nottingham Forest mismatched — FPL `NFO`, football-data `NOT`.)

After a season rollover:

1. **Re-run bootstrap once** locally with prod creds (or wait for the daily Vercel Cron at 04:00 UTC).
2. **If `mergeFootballDataIds` throws** with `missing football-data IDs after merge: <list>`, that's the new-season gap. The error names the unmatched team(s).
3. **Look up the team's football-data tla** at `https://api.football-data.org/v4/competitions/PL/teams` and add a one-line entry to `FPL_TO_FD_TLA`.
4. **Re-run bootstrap.** Coverage assertion passes; live scoring works for the new team.

Fixture-level coverage gaps are warn-only (rescheduled / late-published matches fill in on subsequent bootstrap runs). Team gaps fail loudly because every team must be matchable for live scoring to work.

## Per-fixture settlement

The game lifecycle (pick → fixture finish → evaluate → eliminate → advance) is driven by `settleFixture` (`src/lib/game/settle.ts`). It's called from every place `fixture.status='finished'` is written: `/api/cron/poll-scores` (live observation) and `syncCompetition` (bootstrap + daily-sync mirror).

Round completion is **emergent** — a round is done when every fixture in it has been settled. There is no separate round-batched processing step.

Recovery surfaces (idempotent safety nets, in case the inline settle missed something):
1. Game-detail page SSR → `reconcileGameState(gameId)`.
2. `GET /api/games/[id]/live` → same.
3. Daily-sync cron → `reconcileAllActiveGames`.
4. Manual `POST /api/cron/process-rounds` → same.

Never add a fifth trigger path — extend an existing one. See `docs/game-modes/README.md` for the full settlement model + state machines.

## Adding a new competition

Before merging a PR that introduces a new competition:

1. **Bootstrap path.** Add the competition to `bootstrapCompetitions`. Confirm `syncCompetition` runs end-to-end against the chosen adapter (FPL / football-data / manual).
2. **Live scoring.** If FPL-bootstrapped, confirm `mergeFootballDataIds` doesn't throw on the team set; add to `FPL_TO_FD_TLA` if any team-code mismatch surfaces. If football-data-native, no merge step.
3. **Cup-mode requirements.** If the competition supports `cup`, ensure every team has its tier marker (FIFA pot for WC; design a per-competition equivalent for new comps) and that game creation refuses to start a cup game with incomplete coverage. Cup-tier maths silently returns 0 for untagged teams — never let it ship without runtime validation.
4. **Smoke scenarios.** For every game mode supported on the new competition, add a scenario to `scripts/smoke/lifecycle.smoke.test.ts`. Each scenario must seed fixtures, write final scores directly, call `settleFixture` (or `liveFixture` + `getLivePayload` for projection cases), and assert the relevant state. Local: `just smoke`; CI runs it automatically.
5. **State-machine docs.** Update `docs/game-modes/` if the new competition introduces a state transition not already documented (e.g. group-stage → knockout boundary handling, mid-tournament auto-elimination).

## Platform Context

Platform standards and choices: see ~/code/platform/
This project's registry entry: products/last-person-standing.yaml
