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
- **Deployment:** Vercel (lhr1 region) — production: <https://last-person-standing.app> (custom domain since 2026-06-04; `last-person-standing-theta.vercel.app` 308-redirects to it for backwards compatibility)

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
- **Game modes**: `classic` is the only **multi-round** mode — one pick per round, survive round to round, last person standing. `turbo` and `cup` are **single-round**: N confidence-ranked predictions in one gameweek/round, longest streak of correct picks wins (no eliminations-to-advance, no carry-over). `cup` is turbo plus a tier handicap + lives. See `docs/game-modes/` for the authoritative per-mode spec.
- **Pick views (classic)**: the picker has two — **Fixtures** (`FixtureRow` per match) and **Table** (`PickTable`: one sortable row per pickable team, defaulting to win-probability descending). Which one a round opens on comes from `defaultPickView` (league → Table, knockout → Fixtures); with no standings behind the round the Table is hidden entirely. The row shapes, the sort and its degradation rules are pure functions in `src/lib/game/pick-table-view.ts` — put ordering logic there, not in the component. The Table's standings columns come from `team.league_position` / `played` / `points` / `goals_for` / `goals_against`, all written by the same sync pass (`persistStandings`).
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
- `ODDS_API_KEY` — the-odds-api.com API key (free tier). Bookmaker 1X2 prices, de-vigged into the indicative win-probabilities the pick selector shows. Read only by the daily-sync cron (`syncFixtureOdds`), one request per competition per run; odds for a round freeze at its deadline. Absent or empty means the refresh is skipped entirely and fixtures render no win-probability — never a zero. Provisioned via Doppler like every other secret (`prd` auto-syncs to Vercel Production; `stg` reaches Vercel Preview through `just sync-preview-env`, whose `KEYS` allow-list includes it).
- `QSTASH_TOKEN` — Upstash QStash client token.
- `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` — QStash webhook signature verification.
- `VERCEL_URL` — deployment URL used as the QStash callback base. Populated automatically in Vercel builds; set manually in dev if you want to exercise QStash locally.
- `VERCEL_ENV` — `production` | `preview` | `development`, set by Vercel itself (never by us). Read only by `src/lib/preview.ts` to gate the `/preview` component gallery: auth-free everywhere except production, 404 on production. Leave unset locally.
- `NEXT_PUBLIC_APP_URL` — public origin of the deployed app. Used by the Better Auth client (`src/lib/auth-client.ts`) as its `baseURL`. **Must match the deployed URL exactly** so the browser can reach `/api/auth/*`. As a `NEXT_PUBLIC_*` var, it's bundled into the client at build time — changing it requires a redeploy.
- `RESEND_API_KEY` — Resend API key for transactional email (password reset). Provisioned manually via Doppler (same path as every other secret): Doppler `prd` auto-syncs to Vercel Production; Doppler `stg` is pushed to Vercel Preview via `just sync-preview-env`. Sender domain is `last-person-standing.app`, verified in LPS's own Resend workspace (separate from moontide's account — Resend free tier is one verified domain per workspace). If absent in local dev, `src/lib/email.ts` logs the email payload to stdout instead of sending, which keeps unit/integration tests deterministic.

GitHub Actions secrets (repo-level):
- `CRON_SECRET` — same value as Doppler `prd.CRON_SECRET`. Used by `live-scores.yml` for the every-minute poll.
- `VERCEL_PROD_URL` — full https URL of the Vercel production deployment. Used by `live-scores.yml` as the request target.
- `PROD_DATABASE_URL` — same value as Doppler `prd.DATABASE_URL`. Used by `migrate.yml` to apply Drizzle migrations on push to `main`. Duplicated from Doppler intentionally; revisit if rotation cadence increases.

## PL season rollover (annual verification ritual)

Every August, the Premier League season changes — 3 promoted teams replace 3 relegated ones. The rollover itself is **automatic**: the daily sync (a GitHub Actions workflow, `.github/workflows/daily-sync.yml`, scheduled 04:00 UTC — *not* a Vercel cron; FPL's Cloudflare blocks Vercel egress, so the workflow fetches the FPL payloads and POSTs them to `/api/cron/daily-sync`) detects the season via football-data's `currentSeason` cross-checked against FPL's GW1 deadline (`ensureCurrentPlSeasonCompetition`), creates "Premier League YYYY/YY", and archives the predecessor in one transaction — all before any sync writes. On detection failure it throws `SeasonDetectionError`: zero writes, a failed `cron_run` row, a red Actions job. It never guesses.

The human ritual is **verification only** — nothing to execute:

1. **Check the first August daily-sync runs are green**: `gh run list --workflow=daily-sync.yml`.
2. **Run the read-only inspector** (season-agnostic — it derives the expected season from the sources): `doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-rollover.ts`. It verifies the new competition (38 rounds / 380 fixtures / 20 teams), GW1 pairings against both FPL and football-data, team badge + external-id coverage, and that predecessor seasons stay archived and untouched. Exits non-zero on any failed check.
3. **Add colour entries for promoted clubs** in `src/lib/teams/colours.ts` if the inspector flags any team falling back to grey.
4. **Add odds-name entries for promoted clubs** in `ODDS_API_NAME_TO_SHORT_NAME` (`src/lib/game/sync-fixture-odds.ts`) — the-odds-api spells clubs in full ("Wolverhampton Wanderers") where FPL abbreviates ("Wolves"), and a club absent from that table loses its win-probability with no error. Both tables are supersets: add, don't replace. The signal is the daily-sync log line `[syncFixtureOdds] … unmatched market(s)` (also `odds.unmatched` in the cron's response); a unit test holds the table to `TEAM_COLOURS`'s coverage, so keeping the two in step keeps CI green.
5. **Confirm a GW1 game can be created** — the new competition's Gameweek 1 must be pickable (future deadline) in the game-creation flow.

Two failure modes need a human hand, and both fail loudly rather than corrupt:

- **`SeasonDetectionError`** (red run, zero writes): the sources disagree or one is missing data — investigate before anything else; do not hand-create the season.
- **`mergeFootballDataIds` team-coverage error** (`missing football-data IDs after merge: <list>`): a promoted club's FPL `short_name` and football-data `tla` disagree (as of 2025/26 only Nottingham Forest: FPL `NFO`, fd `NOT`). Add a one-line entry to `FPL_TO_FD_TLA` in `src/lib/game/bootstrap-competitions.ts`, deploy, and let the next sync run. Team gaps fail loudly because every team must be matchable for live scoring; fixture-level gaps are warn-only (rescheduled / late-published matches fill in on subsequent runs).

## Component preview gallery

`/preview` renders components against hand-built fixtures — no auth, no database, no live game. It's the review surface for UI work: `/preview/game-hero` covers the game page's top-of-page chrome — the identity bar, the stat line (including the pot disclosure and the unpaid notice) and every `GameHero` state × game mode — from descriptors shaped like `buildGameView`'s output, `/preview/live-scores` covers the on-demand live scores pop-out from hand-built live payloads (including live-window scenarios a database won't produce on demand), and `/preview/picks` covers the pick selector's shared `FixtureRow` — the nested planner context and the form-detail panel included. It is grouped: a shared-row section (the states any mode can put the row in, including a fixture with bookmaker win-probabilities and the same fixture unpriced), then one section per mode. Classic's group also carries the **Table view** (`PickTable`): the same round as a standings board, one sortable row per pickable team, in the states the board has to survive — fully priced, unpriced, partly priced (the case the sink-to-the-bottom sort rule exists for), a season start with nothing played, and used/restricted teams. Classic's sections carry the full `SideState` matrix in classic's own wording, and `ClassicPick` itself in each state the card moves through (no pick / selected / locked-collapsed / round-closed) — the card states are what make the hero de-duplication reviewable, since what matters there is the round name and deadline being *absent*. Cup's section is `CupPick` itself (nothing ranked / part-ranked / read-only), reviewing the same absence plus what cup gets from the shared row for nothing: it sources neither form nor league position — a cup team's form lives in its league, deferred to the FA-Cup effort — so the bottom bar stands down and the tier annotations carry the row. Turbo's sections cover its whole picker — the real `TurboPick`, in each state of its submission (nothing ranked / partially ranked / fully ranked / unsaved changes / season start with no form) — plus its ranked rows in isolation.

- Gated by `previewRoutesEnabled()` (`src/lib/preview.ts`): enabled unless `VERCEL_ENV === 'production'`. Enforced twice — `proxy.ts` only waives auth for `/preview` outside production, and `src/app/preview/layout.tsx` calls `notFound()` on production.
- Fixtures live next to their gallery page (e.g. `src/app/preview/game-hero/fixtures.ts`). When you add a state to a state-driven component, add its fixture there in the same PR.
- Galleries must stay database-free. If a component needs client state or a live payload to render (e.g. the dismissible banners), split the presentational half out and render that. `TeamFormPanel` / `TeamFormSheet` (`src/components/picks/`) is the worked example: the panel is pure presentation, the sheet owns the server action.
- Click handlers can't cross the server-component boundary, so a gallery's interactive rows live in a sibling client file (`identity-bar-demo.tsx`, `preview-live-scores.tsx`, `picks-demo.tsx`) that takes plain serialisable fixtures.

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

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on `lennons301/last-person-standing`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
