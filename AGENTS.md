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

## Platform Context

Platform standards and choices: see ~/code/platform/
This project's registry entry: products/last-person-standing.yaml
