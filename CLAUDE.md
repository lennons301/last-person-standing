@AGENTS.md

# Last Person Standing

## Project Overview

Premier League Survivor Picks game — clean-room Next.js 16 rewrite.

## Tech Stack

- **Framework:** Next.js 16 (App Router, `src/` directory)
- **Database:** Neon (serverless Postgres) + Drizzle ORM
- **Auth:** Better Auth (database sessions, email+password)
- **UI:** shadcn/ui + Tailwind CSS + Geist font
- **Deployment:** Vercel (Hobby tier)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Linting
npm run test         # Run tests
npm run db:migrate   # Apply database migrations
npm run db:seed      # Seed database with dev data
```

## Project Structure

```
src/
  app/
    (auth)/                   # Public auth pages (login, signup)
    (app)/                    # Authenticated pages (home, games, picks)
      games/                  # Game list, create, detail, admin, progress
      pick/[gameId]/[mode]/   # Unified pick page
    api/
      auth/[...all]/          # Better Auth handler
      fpl/sync/               # FPL data sync (cron)
      scores/poll/            # Live scores polling (cron)
      games/                  # Game CRUD + processing (cron)
      picks/                  # Pick submission
  components/
    ui/                       # shadcn/ui primitives (@base-ui/react, NOT Radix)
    providers.tsx             # Theme + Toaster
    features/
      navigation/             # Navbar, user menu
      games/                  # Game card, list, create form, join button
      picks/                  # Pick selector, fixture row, team badge
      leaderboard/            # Adaptive leaderboard
      progress/               # Elimination grid
      admin/                  # Player management
  lib/
    auth.ts                   # Better Auth server config
    auth-client.ts            # Better Auth client
    auth-helpers.ts           # getSession() (cached), requireSession() (redirect)
    db.ts                     # Drizzle + postgres.js connection
    types.ts                  # Inferred types from Drizzle schema
    schema/                   # Drizzle schema (auth.ts, domain.ts, index.ts)
    game-logic/               # Pure functions: classic, turbo, escalating, cup, gameweeks, prizes
    picks/                    # Pick validation
    fpl/                      # FPL API client + Drizzle sync
    scores/                   # Scores provider interface + stub
    utils.ts                  # cn() utility
  proxy.ts                    # Next.js 16 route protection (replaces middleware.ts)
drizzle/
  seed.ts                     # Seed script for dev data
scripts/
  migrate-data.ts             # One-time migration from old Supabase DB (skeleton)
vercel.json                   # Region (lhr1) + cron schedules
```

## Key Conventions

### Local Development
- Local Postgres 17 via docker compose: `docker compose up -d`
- All commands run via Doppler: `doppler run -- npm run dev`
- Setup: `docker compose up -d && doppler run -- npm run db:push && doppler run -- npm run db:seed`

### Secrets
- Doppler is source of truth — never create .env.local with secrets
- Required secrets in Doppler (dev): DATABASE_URL, BETTER_AUTH_SECRET, NEXT_PUBLIC_APP_URL
- CRON_SECRET required for cron API routes in deployed environments
- .env.example contains templates for reference

### Database
- Schema in Drizzle: `src/lib/schema/auth.ts` (Better Auth tables), `src/lib/schema/domain.ts` (app tables)
- Migrations: `npm run db:generate` then `npm run db:migrate`
- Quick push (dev only): `npm run db:push`
- Seed: `drizzle/seed.ts`
- Authorization enforced in TypeScript, not Postgres RLS

### Types
- Import types from `@/lib/types`, not from schema files directly
- Types are Drizzle-inferred (`$inferSelect`/`$inferInsert`) — camelCase properties
- `numeric` columns (entryFee, stake) are `string` in TypeScript, not `number`
- `settings` (jsonb) is typed via `GameSettings` interface in types.ts

### Auth
- Config: `src/lib/auth.ts` (server), `src/lib/auth-client.ts` (client)
- API route: `src/app/api/auth/[...all]/route.ts`
- Server components: use `getSession()` (cached) or `requireSession()` (redirects) from `@/lib/auth-helpers`
- API routes: use `auth.api.getSession({ headers: request.headers })` from `@/lib/auth`
- Client: `useSession`, `signIn`, `signUp`, `signOut` from `@/lib/auth-client`

### Route Protection
- `src/proxy.ts` redirects unauthenticated users to `/login` (Next.js 16 proxy, export name is `proxy`)
- Public routes: `/login`, `/signup`, `/api/auth/*`
- Cron routes (`/api/fpl/*`, `/api/scores/*`, `/api/games/process`) authenticate via `CRON_SECRET` header, not session

### Game Logic
- Pure functions in `src/lib/game-logic/` — no DB dependencies, fully tested with Vitest
- Classic: team must win outright (draw = elimination)
- Turbo: predict home/draw/away, 1 point per correct
- Escalating: same as classic with increasing stakes
- Cup: bracket-based, side-picking on real PL fixtures

### UI Components
- shadcn/ui uses `@base-ui/react` (NOT Radix) — `asChild` prop is NOT available on Button
- Use `buttonVariants` from `@/components/ui/button` for styled Links
- Dark mode by default via `next-themes` (ThemeProvider in providers.tsx)
- Toast notifications via `sonner` (`toast` import)

### API Routes
- Cron routes: authenticate with `Authorization: Bearer ${CRON_SECRET}`
- User routes: authenticate with Better Auth session
- All params are Promises in Next.js 16: `const { id } = await params`

## Platform Context

Platform standards and choices: see /workspace/platform/ (in agent containers)
or ~/code/platform/ (on local machines).
This project's registry entry: products/last-person-standing.yaml
