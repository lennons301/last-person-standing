# Last Person Standing — UI Redesign Spec

> Replaces the placeholder UI with a complete, designed frontend. The backend, game logic, API routes, and auth are already built — this spec covers the visual system, screen designs, and user flows.

## Context

The app is a Premier League Survivor Picks game for private friend groups. All 25 backend implementation tasks are complete (game logic, API routes, auth, FPL sync, cron jobs). The current UI is placeholder scaffolding with no visual identity, no dashboard, and broken flows. This redesign brings the frontend up to a standard that matches the backend quality.

**Audience:** Private friend groups. The creator sets up a game, shares an invite link, friends join. No public discovery or social features.

**Scope:** Visual redesign of all existing screens plus a proper dashboard. No new backend features, no new game modes, no stats/form guide additions. The scores provider remains a stub.

**Future work (explicitly out of scope):**
- Stats and form guide ahead of picks
- Global/cross-game leaderboards
- World Cup / Euros tournament variants (cup mode architecture should accommodate these later)
- Scores API integration (football-data.org or similar)
- Data migration from old Supabase app
- E2E browser tests

## Visual System

### Design Direction: "The Broadcast"

Scoreboard energy. Data-rich, informative, user-friendly. The app should feel like match coverage — live, urgent when matches are on, calm and composed otherwise.

### Typography

Three font families, each with a clear role:

| Font | Role | Usage |
|---|---|---|
| **Bebas Neue** | Display | Page titles, hero text, scores. All-caps, tight tracking. |
| **Syne** | UI | Navigation, buttons, card titles, body text. Variable weight 400–800. |
| **JetBrains Mono** | Data | Stats, deadlines, labels, badges, fixture times. Monospace for alignment. |

Load via Google Fonts. Bebas Neue for impact, Syne for warmth, JetBrains Mono for precision.

### Colour System

Dual-palette: Slate & Teal for light mode, Midnight Amber for dark mode. The accent colours are near-complementary (teal/amber), giving each mode a distinct character while sharing the same layout and semantics.

**Light mode — Slate & Teal:**

| Role | Hex | Usage |
|---|---|---|
| Primary | `#0d9488` | Buttons, ticker, accent text, active states |
| Background | `#f5f7fa` | Page background |
| Surface | `#ffffff` | Cards, nav, panels |
| Text | `#1e2a3a` | Headings, body text |
| Muted | `#8896a7` | Secondary text, labels |
| Border | `#e2e6ec` | Card borders, dividers |

**Dark mode — Midnight Amber:**

| Role | Hex | Usage |
|---|---|---|
| Primary | `#f0a030` | Buttons, ticker, accent text, active states |
| Background | `#14161f` | Page background |
| Surface | `#1a1d28` | Cards, nav, panels |
| Text | `#f0edea` | Headings, body text |
| Muted | `#555a70` | Secondary text, labels |
| Border | `#262a38` | Card borders, dividers |

**Semantic colours (both modes):**

| Role | Light | Dark |
|---|---|---|
| Alive / Success | `#0d9488` (teal) | `#4ade80` (green) |
| Eliminated / Danger | `#dc2626` | `#e05555` |
| Live indicator | Primary with pulse animation | Primary with pulse animation |

### Component Style

- Cards: surface background, 1px border, 8–10px border-radius, no heavy shadows
- Buttons: primary colour fill for main actions, surface/ghost for secondary
- Badges: monospace (JetBrains Mono), uppercase, small, coloured background at low opacity
- Ticker bar: primary colour background, white text, full-width, monospace
- Data labels: JetBrains Mono, uppercase, muted colour, letter-spaced

### Theme Implementation

Use CSS custom properties mapped to shadcn/ui's token system. The `next-themes` ThemeProvider is already in place — extend it with the new palette. Both themes share the same component markup; only the CSS variables change.

## Screen Designs

### Navigation

**Mobile:** Bottom tab bar with three items — Dashboard, Games, Profile. Dashboard is the default tab and default landing page after login.

**Desktop:** Sticky top nav bar with backdrop blur. Logo left ("LAST PERSON STANDING" in Bebas Neue, with "STANDING" in primary colour). Nav links center. User avatar right with dropdown (profile, theme toggle, logout).

Active route indicated by primary colour on both mobile and desktop.

### 1. Dashboard (Home)

The hub. Answers: what needs my attention, what's happening now, how am I doing.

**Layout (top to bottom):**

1. **Ticker bar** — gameweek number + live match count when matches are on. Static "GW29 — Next matches Saturday" when no live matches. Pulsing dot indicator when live.

2. **Goal notifications** — cards that appear when relevant events happen during live matches. Show: scorer + minute, match score, which player in which game this affects, outcome (SAFE / ELIMINATED / etc). Stack vertically, newest on top. Only visible during live match windows.

3. **Section: Your games** — cards for each game the user is in, sorted by "needs pick" first, then by deadline proximity. Each card shows:
   - Game name (Syne, bold)
   - Mode badge (JetBrains Mono, uppercase, primary colour)
   - Stats row: alive count, eliminated count, gameweek or points (mode-dependent)
   - Footer: deadline text + action buttons (Pick / Progress / Edit Pick)
   - Visual distinction for "pick needed" vs "already picked" state

4. **Live scores** — current gameweek fixtures in a card. Each fixture row: home team abbreviation, score (Bebas Neue) or kickoff time, away team abbreviation. Live matches show minute and primary-coloured score. "YOUR PICK" label on the team you've selected. Collapsible, hidden when no fixtures are relevant.

5. **Empty state** — when user has no games: clear message + two CTAs: "Create a game" and "Browse games". Brief one-line explanation of what the app does.

### 2. Pick Page

Arrived at from dashboard game card "PICK" button. URL: `/pick/[gameId]/[mode]`.

**Shared header (all modes):**
- Game name + mode badge
- Gameweek number
- Deadline countdown (e.g. "2d 4h remaining") — becomes urgent red styling under 2 hours

**Classic mode:**
- Previous picks strip — compact row of team abbreviations already used, greyed out
- Fixture list — each row: home team, kickoff time, away team. Tapping a team selects it (highlighted in primary colour). Already-used teams are visually disabled and untappable.
- Sticky footer — appears after selection: "You picked [Team]. Confirm?" with Confirm button. Two-step: select then confirm.

**Turbo mode:**
- Grid of all fixtures. For each: pick Home / Draw / Away. Three tappable segments per fixture row. All fixtures must be predicted.
- Submit button enabled when all fixtures have a prediction.

**Escalating mode:**
- Same as classic but with the escalating stakes context shown (which round, how many picks required).
- Multiple team selections may be needed depending on the round.

**Cup mode:**
- Custom fixture list from the tournament (not PL gameweeks). Fixtures show tier information for each team.
- Pick a side per fixture, rank top 10 in preference order.
- Tier indicators visible — shows tier gap and potential lives earned for underdog picks.
- Lives count displayed prominently.
- Cannot pick a team more than 1 tier below their opponent (shown as disabled).

### 3. Game Detail

URL: `/games/[id]`. The game's home page — leaderboard and info.

**Header:**
- Game name (Bebas Neue, large)
- Mode badge + status badge (open / active / finished)
- Player count

**Your status (if player):**
- Prominent card: alive/eliminated, current streak, lives (cup mode)
- Quick actions: Make Pick (if pick due), View Progress

**Leaderboard:**
- Ranked table of all players
- Columns: rank, name, status (alive/eliminated), elimination gameweek (if applicable)
- Current user highlighted in primary colour
- Eliminated players shown with muted/strikethrough styling

**Actions:**
- Share invite link (if game is open)
- Admin link (if creator)

### 4. Progress Grid

URL: `/games/[id]/progress`. Existing feature, needs visual refresh only.

- Players as rows (sticky left column), gameweeks as columns
- Cells: team abbreviation, coloured green (survived) or red (eliminated)
- "—" for no pick
- Horizontal scroll for many gameweeks
- Current user's row highlighted

### 5. Create Game

URL: `/games/new`.

**Step 1: Name + Mode**
- Game name text input
- Mode selection as visual cards (not dropdown). Each card: mode name, icon, 1-line description. Cards arranged in a 2x2 grid.
  - Classic: "Pick a team each week. If they lose, you're out."
  - Turbo: "Predict every result. Points for each correct pick."
  - Escalating: "Classic rules with rising stakes each round."
  - Cup: "Follow a knockout tournament. Tier handicaps and lives."

**Step 2: Mode settings (appear after mode selection)**
- Entry fee (optional, number input)
- Starting gameweek (select, classic/turbo/escalating only)
- Any mode-specific settings

**Create button** — creates the game, redirects to game detail page with a share prompt (copy invite link).

### 6. Join Game

Primary entry point:
- **Via shared link** — URL with game ID (e.g. `/games/abc123`). If the user isn't a member, the game detail page shows game info (name, mode, creator, player count) and a "Join" button instead of the leaderboard. No separate join page needed — the game detail page handles it.

The empty state on the dashboard also links to the games list where open games are visible.

### 7. Auth Pages

URL: `/login`, `/signup`.

**Login:**
- App name in Bebas Neue (with "STANDING" in primary colour)
- Brief tagline: "Survivor picks with your mates"
- Email + password inputs
- Login button (primary colour)
- "Don't have an account? Sign up" link

**Signup:**
- Same header/tagline
- Name + email + password inputs
- Sign up button
- "Already have an account? Log in" link

Both pages centered, max-width constrained, using the branded colour system. No social auth, no forgot password (for now).

### 8. Admin Page

URL: `/games/[id]/admin`. Existing feature, needs visual refresh only.

- Player management table: name, status, actions (toggle elimination, remove)
- Game settings display
- Styled consistently with the new system

## Responsive Behaviour

**Mobile-first.** All screens designed for 375px+ width first, enhanced for desktop.

- Bottom tab bar on mobile, top nav on desktop (breakpoint: 768px)
- Game cards stack single-column on mobile, can go 2-col on wider screens
- Fixture lists full-width on all sizes
- Progress grid: horizontal scroll with sticky player names
- Pick page: full-width fixture rows, sticky confirm footer

## Implementation Notes

### What changes
- `src/app/globals.css` — new CSS custom properties for both themes
- `src/app/layout.tsx` — Google Fonts (Bebas Neue, Syne, JetBrains Mono)
- `tailwind.config.ts` — extend with custom font families
- All page files in `src/app/` — redesigned JSX and styling
- All feature components in `src/components/features/` — redesigned
- `src/components/features/navigation/` — new navbar (desktop) + bottom tabs (mobile)
- New component: `src/components/features/dashboard/` — goal notifications, live scores, game cards

### What doesn't change
- `src/lib/` — all game logic, auth, db, schema unchanged
- `src/app/api/` — all API routes unchanged
- `drizzle/` — schema and seed unchanged
- `src/components/ui/` — shadcn primitives stay, just rethemed via CSS variables
- `proxy.ts` — route protection unchanged

### Font loading
Load Bebas Neue, Syne (variable), and JetBrains Mono (variable) via `next/font/google` for optimal performance. Define as CSS variables and reference in Tailwind config.

### Theme switching
Existing `next-themes` setup. Extend the CSS variable system so light mode maps to Slate & Teal tokens and dark mode maps to Midnight Amber tokens. Default to system preference (currently forced dark — change this).
