# Last Person Standing — development commands
# Run `just` to see all available commands

dev:
    pnpm dev

test *args:
    pnpm exec vitest run {{args}}

test-watch *args:
    pnpm exec vitest {{args}}

lint:
    pnpm exec biome check --write .

typecheck:
    pnpm exec tsc --noEmit

build:
    pnpm build

setup:
    pnpm install
    docker compose up -d
    just db-migrate
    just db-seed

db-generate:
    pnpm exec drizzle-kit generate

db-migrate:
    pnpm exec drizzle-kit migrate

db-push:
    pnpm exec drizzle-kit push

db-seed:
    pnpm exec tsx scripts/seed.ts

db-start:
    docker compose up -d

db-stop:
    docker compose down

db-reset:
    docker compose down -v
    docker compose up -d
    just db-migrate
    just db-seed

bootstrap-competitions:
    pnpm exec tsx scripts/bootstrap-competitions.ts
