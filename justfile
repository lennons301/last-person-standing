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
    just env-init
    docker compose up -d
    just db-migrate
    just db-seed

# Bootstrap .env.local from .env.example if it doesn't exist.
# Real secrets come from Doppler in production; placeholder values in
# .env.example are enough for pnpm build / pnpm test to work locally.
env-init:
    @if [ ! -f .env.local ]; then \
        cp .env.example .env.local; \
        echo "✔ Created .env.local from .env.example — replace placeholders with real values for the services you need."; \
    else \
        echo "↳ .env.local already exists; leaving alone."; \
    fi

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

# Push Doppler/stg secrets to Vercel/preview env (free-tier sync workaround).
# Re-run after any change to Doppler stg secrets.
sync-preview-env:
    ./scripts/sync-preview-env.sh
