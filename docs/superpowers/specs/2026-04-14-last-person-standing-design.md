# Last Person Standing — Design Specification

## Overview

Last Person Standing (LPS) is a football survivor picks game. Players join private games, pick teams each round, and get eliminated if their pick doesn't win. Last player standing takes the prize pot.

This is a ground-up rebuild migrating from a Lovable/Supabase app into the platform infrastructure. The migration priorities are: usability first, platform conformance, code quality, feature parity as a floor, and new features that make the app genuinely better than what it replaces.

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 (App Router) | React 19, TypeScript 5.7 |
| Database | Neon (serverless Postgres) | Local Postgres 17 via Docker for dev |
| Auth | Better Auth | Email + password, database-backed sessions |
| ORM | Drizzle | postgres.js driver, inferred types |
| Package manager | pnpm | Lockfile committed, `--frozen-lockfile` in CI |
| UI | shadcn/ui + Tailwind CSS | @base-ui/react primitives |
| Hosting | Vercel (Hobby) | lhr1 region |
| Secrets | Doppler | Source of truth, `doppler run --` for dev |
| Linting | Biome | Pre-commit via husky + lint-staged |
| Testing | Vitest | Game logic and validation, run against local DB |
| Dev environment | mise + just | Standard commands: setup, dev, test, lint |
| Observability | Sentry | Error tracking, performance |
| CI/CD | GitHub Actions | Lint, typecheck, test, build on every PR |

---

## Architecture: Competition-Agnostic Engine

The core architectural decision: game modes are independent from competitions. A competition provides fixtures. A game mode provides rules. A game binds the two together.

### Competitions & Rounds

A **competition** is a fixture source — Premier League 25/26, World Cup 2026, FA Cup 3rd Round. Each has:

- A **data source adapter** (FPL API, football-data.org, or manual entry)
- A set of **rounds** — the generic term replacing "gameweek." For PL, rounds map 1:1 to FPL gameweeks. For World Cup, they map to group match days and knockout rounds. For FA Cup, a single round.
- A **structure type**: `league` (recurring rounds over a season), `knockout` (single/few rounds), or `group_knockout` (World Cup-style phases)

A **round** has:
- Fixtures (teams, kickoff times, results)
- A deadline (when picks lock)
- A status: `upcoming` → `open` → `active` → `completed`

### Games & Modes

A **game** binds a mode to a competition:
- `name`, `created_by`, `status`, `entry_fee`, `max_players` (optional cap)
- `competition_id` — which fixtures to use
- `game_mode` — `classic`, `turbo`, or `cup`
- `mode_config` — mode-specific settings (e.g. starting lives for cup, number of picks for turbo)
- `invite_code` — unique code for the join link

**Game status lifecycle:** `setup` (creator configuring) → `open` (accepting players via invite link) → `active` (first round started, no new joins) → `completed` (winner declared or split pot)

This means World Cup support isn't a new game mode — it's a new competition adapter. You create a Classic game against World Cup fixtures the same way you'd create one against PL fixtures.

### Players & Picks

- **game_player** — participation record: status (`alive` / `eliminated` / `winner`), `eliminated_round`, `lives_remaining` (cup mode)
- **pick** — a player's selection for a round: team picked, confidence rank (for multi-pick modes), result, `auto_submitted` flag (for planned picks)

### Payments

- **payment** — tracks who's paid what: status (`pending` / `paid` / `refunded`), method (`manual` / future Mangopay integration)
- **payout** — calculated winner payouts, split logic, status

Payment tracking at launch (who's paid, who hasn't, admin reminders). Mangopay integration designed for but not built — the data model supports plugging it in without restructuring.

### Teams & Form

- **team** — canonical team data synced from competition source, including badge URLs
- Form data cached from football-data.org — last 6 results, home/away split, league position, head-to-head where available

---

## Game Modes

### Classic

The core LPS experience. One pick per round, one team to win. If your team doesn't win, you're eliminated.

- Player picks one team from the round's fixtures
- Teams already picked in previous rounds are unavailable ("used")
- Win = survive, draw or loss = eliminated
- Last player standing wins the pot
- **Pick planner**: collapsible view showing future rounds, letting players sketch out "if I pick Arsenal now, I could do Chelsea GW26, Spurs GW27..." A planning scratchpad — tentative by default, with optional auto-submit toggle for any future pick

### Turbo

Higher engagement, more decisions. Predict 10 fixture outcomes ranked by confidence.

- Player predicts results (home win / draw / away win) for 10 fixtures in a round
- Predictions ranked by confidence (1 = most confident, 10 = least)
- Consecutive correct predictions from the top determine score (e.g. if your top 6 are correct but #7 is wrong, your streak is 6)
- Goals scored in winning picks serve as tiebreaker when streaks are equal
- Leaderboard shows streak length and goals

### Cup

Structurally similar to Turbo but operates on a single cup round (e.g. FA Cup 3rd Round) with a lives/handicap system.

- Player picks outcomes for 10 cup fixtures, ranked by confidence
- Each fixture has a **tier difference** value reflecting the league gap between teams (e.g. Premier League vs League Two = large tier difference)
- Lives mechanic:
  - Each player starts with a configurable number of lives (default: 0)
  - A correct pick against a team 2+ tiers above your chosen team grants +1 life
  - A draw against a team 2+ tiers above counts as a success (not a loss)
  - An incorrect pick costs 1 life (if available) or eliminates
  - Goals are not counted when picking against a team only 1 tier below
- Creates risk/reward decisions: do you burn a high-confidence slot on a "safe" pick, or gamble on the upset and bank a life?
- Typically a one-off event, not a recurring season-long game

### Common Patterns Across Modes

- Form guide and fixture context on every pick page
- Deadline countdown always visible
- "Your pick is locked" confirmation state after submission
- Match day live view with "as it stands" elimination preview

---

## Information Architecture & Navigation

### Design Principle: Reduce Clicks

Most users have 1-2 active games and visit weekly to make a pick. The app optimises for that flow, not for browsing or discovery.

### Three Primary Destinations

**1. Dashboard** (`/`)

The home page. No marketing text, no explanations. Your games at a glance:
- Active games with status (need to pick / picked / eliminated / won)
- Live scores on match days for fixtures relevant to your games
- Payment status per game
- If you have one active game, the dashboard feels like it IS that game — status, deadline, standings right there without clicking through

**2. Game** (`/game/:id`)

Everything about a single game. Sections for: make your pick, standings/leaderboard, pick history, game info (rules, players, pot). Admin controls visible only to the game creator. The pick experience lives within this context — you see fixtures, form guides, remaining teams, and make your pick without leaving.

**3. Create Game**

Wizard flow: name → competition → mode → settings → create. Reachable from dashboard.

### Secondary Destinations

- **Join Game** — via shared invite link, minimal friction (join → pay later)
- **Profile/Settings** — lightweight, not a primary flow

### Navigation

- Compact top bar: logo, game switcher (if multiple games), create/join, avatar
- No sidebar, no hamburger menu hiding important things
- On mobile, the game switcher becomes the primary nav element
- Back navigation within a game is contextual breadcrumb, not browser back

### Responsive Design

Mobile-first — most users check this on their phone (WhatsApp link → open app → make pick → check standings). Desktop gets more space for data tables and the progress grid, not a fundamentally different layout. One experience that works equally well in browser and on mobile.

---

## Match Day Experience

The centrepiece of the social experience. When matches are live:

### "As It Stands" View

Shows every player in your game, their pick, and their current fate:
- Each player row shows: name, team badge of their pick, the live score, and status
- Status states: **safe** (team winning, green), **sweating** (team drawing, amber highlight), **eliminated** (team losing, red, faded)
- Summary line: "9 alive · 2 sweating · 1 out"
- Auto-refreshes as scores update (polling football-data.org every 30-60s)
- This is what players refresh during matches — real-time elimination drama

### Live Score Context

The dashboard surfaces live scores for fixtures relevant to your active games. "Your pick (Arsenal) is winning 2-0" as the headline, not a ticker for every match.

---

## Admin Experience

### Design Principle: Automate Everything, Surface Exceptions

Most rounds require zero admin action. Data syncs from competition adapters, results process automatically, eliminations are calculated by the game engine. The admin's job is oversight, not data entry.

### What's Automated

- Fixture data — synced from competition adapters
- Score updates — synced from live data sources
- Deadline management — defaults from competition source (FPL deadlines for PL)
- Elimination processing — game engine calculates from results
- Prize pot calculation — from entry fees and player count

### Primary Admin Actions (Front and Centre)

**Late pick entry**: One-tap action from the game view. Admin sees "deadline passed," taps "allow late pick" for a specific player — unlocks their deadline. This is the most common admin task.

**Split pot ending**: When a game is down to final few players, a first-class action: "2 players remaining → [Continue] or [Split Pot]." No need to grind through elimination to zero. The remaining players share the pot (equal or custom split).

### Secondary Admin Actions (Settings/Overflow)

- Deadline overrides for a specific round
- Manual pick entry on behalf of a player
- Remove a player from the game
- Game settings changes (name, config)
- Payment reminders (who hasn't paid)

### Admin Is Not a Separate Page

Contextual controls within the game view, visible only to the creator. A "manage" section showing payment status and player actions. Automated results processing with admin notification: "Round 25 results are in. 3 players eliminated. [Review & Confirm]."

---

## Visual System: Kit Room

### Core Concept: Contextual Colour

The app has no fixed brand accent colour. Club badges and team colours ARE the colour. When you're picking Arsenal, you see red. Chelsea, blue. The neutral warm surface lets every team's identity pop without competing. Form dots, badges, and status indicators provide all the visual energy.

### Typography

- **Display**: Fraunces — old-style serif with personality. Warm, slightly quirky optical sizing. Used for headlines, game names, numbers that matter. Feels human, not corporate.
- **Body & UI**: DM Sans — geometric sans with low contrast. Clean, modern, highly readable at any size. Carries the interface without drawing attention.

### Colour Palette

**Light mode:**
- Background: `#f6f5f1` (warm off-white)
- Card: `#ffffff`
- Text: `#1a1a1a`
- Text secondary: `#6b6b6b`
- Border: `#e8e6e1`

**Dark mode:**
- Background: `#111113`
- Card: `#1a1a1f`
- Text: `#f0eeeb`
- Text secondary: `#9a9895`
- Border: `#2a2a2f`

**Semantic colours (both modes):**
- Alive/Win: green (`#16a34a` light / `#4ade80` dark)
- Eliminated/Loss: red (`#dc2626` light / `#f87171` dark)
- Draw/Sweating: amber (`#ca8a04` light / `#fbbf24` dark)
- Action/Link: blue (`#2563eb` light / `#60a5fa` dark)

**Team colours as accents:** Each team's primary colour is used for their badge, row highlights on pick pages, and contextual accents. The neutral UI surface makes these pop.

### Visual Status Indicators

Statuses are the things users notice. They must have visual pop, not just text colour:
- Form guide: W/D/L as coloured square dots (green/amber/red) with letter inside
- Game status: coloured badge chips (alive = green bg, eliminated = red bg)
- Match day: full row colour treatment (sweating = amber bg tint, eliminated = red bg tint + faded)
- Pick result: clear win/loss/draw indicators on history views
- Club badges everywhere teams appear — never just text team names

### Design Principles

- Readable fonts at normal sizes — no tiny monospace
- Club badges are first-class visual elements, not afterthoughts
- Visual richness through status indicators, badges, and team colours — not decorative chrome
- Mobile-first layout that gains space on desktop, not a different design
- Dark mode as a proper alternative, not an afterthought

---

## Shareable Images & WhatsApp Integration

### Image Generation

Server-side HTML-to-image using Satori / `@vercel/og` on Vercel. Purpose-built templates for each shareable, not screenshots.

**Shareable types:**
- **Standings** — game name, player list with status badges, pot value. Club badges next to each player's pick.
- **"As it stands"** — match day snapshot: each player, their pick, live score, fate. Full visual treatment (sweating/eliminated/safe).
- **Progress grid** — season view: players as rows, rounds as columns, each cell showing badge + W/D/L colour fill.
- **Winner announcement** — celebratory: player name, pot amount, game name.

All images: Kit Room visual system, consistent footer with branding, 1080px wide for clean WhatsApp rendering.

### WhatsApp Integration

**Launch:** Share buttons generate the image and open WhatsApp with a pre-composed message + image. User taps send. Covers all sharing scenarios with zero integration complexity.

**Future (WhatsApp Business API):** Fully automated group messages triggered by game events.

### Notification Architecture

Event-driven from day one, even though launch delivery is manual sharing:

**Events:**
- `round_opened` — fixtures confirmed, make your picks
- `deadline_approaching` — 24h, 2h reminders for players who haven't picked
- `deadline_passed` — picks locked, here's what everyone picked
- `results_confirmed` — round complete, who survived
- `game_finished` — winner announced
- `payment_reminder` — admin-triggered, who hasn't paid

**Delivery channels (pluggable adapters):**
- Launch: WhatsApp click-to-share (manual send)
- Future: WhatsApp Business API (automated), push notifications, email

The game creator configures which channel their group uses.

---

## Data Integration Layer

### Adapter Pattern

Each competition data source implements a common interface: sync teams, sync fixtures for a round, sync live scores, sync results. The game engine doesn't know or care where the data comes from.

### FPL Adapter (Premier League)

- Teams, fixtures, gameweek structure, and deadlines from the FPL API
- Structural backbone for PL games: gameweek numbering, deadline times
- Sync schedule: team data at season start, fixtures when gameweeks are announced, deadlines as confirmed

### football-data.org Adapter (Live Scores + International)

- Live scores during matches (polled every 30-60s on match days via Vercel cron)
- Final results for all supported competitions
- Competition structure for World Cup, Euros, FA Cup: rounds, fixtures, teams
- Form data: recent results, standings, head-to-head where available
- Free tier: 10 requests/minute, covers PL + major international competitions

### Combined Strategy for Premier League

Both adapters work together for PL games:
- FPL provides round structure and deadlines
- football-data.org provides faster score updates (~1-2 min vs 5-15 min) and form data
- Results are cross-verified between sources before processing eliminations

### International Competitions

- football-data.org as sole source
- Game creator selects competition and rounds when creating the game
- World Cup: group match days 1/2/3, R16, QF, SF, Final map to rounds
- FA Cup: single round per game

### Sync Strategy

- Vercel cron jobs: every 60s during live matches, less frequently otherwise
- Match day detection: only poll live scores when active games have fixtures kicking off today
- Stale data protection: if a source is unreachable, surface in admin view but don't block the game

### Form Guide Data

Cached per team, refreshed after each round completes:
- Last 6 results (W/D/L) with opponent and score
- Home/away form split
- League position
- Upcoming fixture difficulty (opponent's league position)
- Head-to-head record for specific fixture where available

---

## Payment System

### Launch: Payment Tracking

The app tracks payments — it doesn't process them. This solves the "chasing payments on WhatsApp" problem without regulatory complexity.

- Game creator sets entry fee at game creation
- Each player has a payment status: `pending` or `paid`
- Admin marks players as paid when they receive payment (Venmo, bank transfer, cash)
- Dashboard shows "3 of 14 unpaid" with a list of who hasn't paid
- Payment reminder is a notification event (shareable to WhatsApp)
- Prize pot calculated from entry fee × player count
- Payout calculation supports equal split and custom split

### Future: Mangopay Integration

Designed for but not built at launch. The payment data model supports:
- Each game gets a wallet (Mangopay concept)
- Players pay via card/Apple Pay when joining
- Funds held under Mangopay's e-money license (not ours)
- Automatic payout to winners when game ends
- ~3.3% fee on pot

**Regulatory note:** Games with entry fees and winner-takes-pot may be classified as pool betting under the UK Gambling Act 2005. The private/non-commercial exemption (Section 295) may apply for friends-only games with no rake. Legal advice recommended before implementing in-app payment collection. This does not affect the payment tracking feature.

---

## Pick Planning (Classic Mode)

### Primary Value: Strategic Visibility

The pick planner's main purpose is answering "if I pick Arsenal this week, who does that leave me for the rest of the season?" It's a planning tool first, submission mechanism second.

### How It Works

- Collapsible section below the current round's pick interface
- Shows future rounds with confirmed fixtures (where known)
- Player can assign tentative picks to future rounds
- Tentative picks are a personal scratchpad — not submitted, not visible to others
- Each tentative pick shows which teams would remain available after that choice
- Used teams are greyed out across all future rounds, updating live as you plan

### Auto-Submit (Optional)

- Any tentative future pick can be toggled to "auto-submit"
- An auto-submitted pick locks in when the round's deadline arrives
- Useful for holidays or known-in-advance easy picks
- Clearly distinguished visually from tentative plans (solid vs dashed outline, or similar)
- Player receives a notification when an auto-pick is submitted on their behalf

---

## Key UX Decisions Summary

| Decision | Rationale |
|----------|-----------|
| No home/marketing page — dashboard is home | Most users are returning players, not new visitors. Reduce clicks. |
| Pick experience lives within game context | No separate pick page to navigate to. See fixtures and pick in the same view. |
| Admin is contextual, not a separate page | Most rounds need zero admin. Surface exceptions (late picks, split pot) prominently. |
| Mobile-first responsive | Most interaction happens on phones via WhatsApp links. |
| Neutral UI with team-colour accents | Club badges and form indicators provide visual life. No competing brand colour. |
| Event-driven notifications from day one | Even though launch is manual sharing, the event architecture supports automated channels later. |
| Competition-agnostic data model | World Cup support is adding a data adapter, not a new game mode or data model hack. |
| Payment tracking before payment processing | Solves the real pain (chasing friends) without regulatory complexity. Mangopay upgrade path is clean. |
| Pick planner as visibility tool | Strategic value is seeing your remaining options, not pre-submitting weeks of picks. |
