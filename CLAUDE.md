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
  app/              # Next.js App Router pages and API routes
    api/auth/       # Better Auth API route handler
  components/       # React components (shadcn/ui in components/ui/)
  lib/
    auth.ts         # Better Auth server config
    auth-client.ts  # Better Auth client
    db.ts           # Drizzle + postgres.js connection
    schema/         # Drizzle schema definitions
      auth.ts       # Better Auth tables (user, session, account, verification)
      domain.ts     # App tables (teams, gameweeks, fixtures, games, picks, etc.)
      index.ts      # Re-exports
    utils.ts        # cn() utility
drizzle/
  seed.ts           # Seed script for dev data
drizzle.config.ts   # Drizzle Kit config
docker-compose.yml  # Local Postgres 17
```

## Key Conventions

### Local Development
- Local Postgres 17 via docker compose: `docker compose up -d`
- All commands run via Doppler: `doppler run -- npm run dev`
- Setup: `docker compose up -d && doppler run -- npm run db:push && doppler run -- npm run db:seed`

### Secrets
- Doppler is source of truth — never create .env.local with secrets
- Required secrets in Doppler (dev): DATABASE_URL, BETTER_AUTH_SECRET, NEXT_PUBLIC_APP_URL
- .env.example contains templates for reference

### Database
- Schema in Drizzle: `src/lib/schema/auth.ts` (Better Auth tables), `src/lib/schema/domain.ts` (app tables)
- Migrations: `npm run db:generate` then `npm run db:migrate`
- Quick push (dev only): `npm run db:push`
- Seed: `drizzle/seed.ts`
- Authorization enforced in TypeScript, not Postgres RLS

### Auth
- Config: `src/lib/auth.ts` (server), `src/lib/auth-client.ts` (client)
- API route: `src/app/api/auth/[...all]/route.ts`
- Server: `auth.api.getSession({ headers: await headers() })`
- Client: `useSession`, `signIn`, `signUp`, `signOut` from `@/lib/auth-client`

## Platform Context

Platform standards and choices: see /workspace/platform/ (in agent containers)
or ~/code/platform/ (on local machines).
This project's registry entry: products/last-person-standing.yaml
