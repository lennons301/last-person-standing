# Last Person Standing

Football survivor picks game: players pick a team each round, are eliminated when their pick doesn't win, and the last person standing takes the pot. Games are public by default, with private games reachable only by invite link. Three modes (classic, turbo, cup) run on Premier League and World Cup competitions.

Production: <https://last-person-standing.app>

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.7
- **Database:** Neon (serverless Postgres); local Postgres 17 via Docker Compose
- **ORM:** Drizzle with the postgres.js driver
- **Auth:** Better Auth (email + password)
- **UI:** shadcn/ui + Tailwind CSS
- **Background work:** GitHub Actions schedules (daily sync, live scores) and Upstash QStash
- **Email:** Resend
- **Linting & formatting:** Biome
- **Testing:** Vitest

## Prerequisites

- [mise](https://mise.jdx.dev/) — tool versions (Node, pnpm)
- [Docker](https://www.docker.com/) — local Postgres via Docker Compose
- [just](https://just.systems/) — task runner (installed via mise)

Production secrets live in Doppler. Local development uses `.env.local`, which `just setup` creates from `.env.example`. The placeholder values are enough to build and run the tests; add real keys only for the services you want to exercise (football-data.org, the-odds-api, QStash, Resend).

## Getting Started

```bash
just setup   # Install deps, create .env.local, start Postgres, migrate, seed
just dev     # Start the dev server
```

Open <http://localhost:3000>.

## Commands

| Command | Description |
|---------|-------------|
| `just dev` | Start dev server |
| `just test` | Run the Vitest suite |
| `just test-watch` | Run tests in watch mode |
| `just smoke` | Lifecycle smoke tests against the local Postgres |
| `just lint` | Lint and format (Biome) |
| `just typecheck` | Type check (tsc --noEmit) |
| `just build` | Production build |
| `just db-migrate` | Apply Drizzle migrations |
| `just db-generate` | Generate a migration from schema changes |
| `just db-seed` | Seed the local database |
| `just db-reset` | Destroy, recreate, migrate and seed the local database |
| `just bootstrap-competitions` | Load competitions, teams and fixtures from the data providers |
| `just sync-preview-env` | Push Doppler `stg` secrets to the Vercel preview environment |

## Project Structure

```
src/
  app/          # Next.js App Router pages, API routes and cron endpoints
  components/   # React components
  lib/          # Auth, database, game engine (lib/game/) and read models
scripts/        # Seed, bootstrap, repair and smoke-test scripts
drizzle/        # Generated migrations
docs/
  game-modes/   # Settlement model and state machines per game mode
  agents/       # Agent-facing workflow docs and review gates
```

See [AGENTS.md](./AGENTS.md) for the full technical reference: conventions, environment variables, the settlement model and the annual season-rollover checklist. The component preview gallery is described in [docs/preview-gallery.md](./docs/preview-gallery.md).

## Environments

| Environment | Database | Secrets | URL |
|-------------|----------|---------|-----|
| dev | Local Docker Postgres | `.env.local` | localhost:3000 |
| preview | Neon | Doppler `stg`, pushed with `just sync-preview-env` | Vercel preview deployments |
| production | Neon | Doppler `prd`, synced to Vercel | <https://last-person-standing.app> |

## CI/CD

GitHub Actions runs lint, typecheck and tests on every PR (`ci.yml`), applies migrations on push to `main` (`migrate.yml`), and drives the scheduled data jobs (`daily-sync.yml`, `live-scores.yml`). Vercel deploys `main` to production and every other branch to a preview URL.
