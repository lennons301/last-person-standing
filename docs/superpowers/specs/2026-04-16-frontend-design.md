# Frontend Design Specification

## Overview

Frontend spec for Last Person Standing — the screen-by-screen design, component architecture, interaction patterns, and responsive behaviour. Builds on the Kit Room visual system agreed in the product spec.

This spec covers what gets built in Plan 3 (Frontend) and informs Plan 4 (Advanced Features) for match day live view, sharing, and data pipeline wiring.

---

## Visual System: Kit Room (Reference)

- **Display font:** Fraunces (warm serif, headlines, game names, numbers)
- **Body font:** DM Sans (geometric sans, UI text, readable at all sizes)
- **Light mode:** Background `#f6f5f1`, Card `#ffffff`, Text `#1a1a1a`, Border `#e8e6e1`
- **Dark mode:** Background `#111113`, Card `#1a1a1f`, Text `#f0eeeb`, Border `#2a2a2f`
- **Semantic colours:** Alive/Win green, Eliminated/Loss red, Draw/Sweating amber, Action blue
- **Core concept:** No fixed brand accent — club badges and team colours provide all visual energy
- **Dark mode:** Proper alternative via next-themes, toggled with class strategy

---

## Route Structure

| Route | Page | Layout |
|-------|------|--------|
| `/` | Dashboard | App (navbar) |
| `/auth` | Login / Signup | Auth (centered card) |
| `/game/create` | Create game | App |
| `/game/[id]` | Game detail | App |
| `/join/[code]` | Join via invite | App (redirects to /auth if needed) |

**Route groups:**
- `(auth)` — centered card layout, no navbar, branding only
- `(app)` — navbar at top, main content below

**Route protection:** `proxy.ts` redirects unauthenticated users to `/auth?callbackUrl=...`. All `(app)` routes require auth.

---

## Layouts

### Root Layout (`src/app/layout.tsx`)
- Loads Fraunces + DM Sans via `next/font/google`
- Wraps children in ThemeProvider (next-themes, class strategy)
- Toaster for notifications

### Auth Layout (`src/app/(auth)/layout.tsx`)
- Centered vertically and horizontally
- No navbar
- Just the content card on the warm background

### App Layout (`src/app/(app)/layout.tsx`)
- Navbar at top
- Main content below with padding
- Navbar contains: logo (left), game switcher dropdown (center-ish), create/join + avatar (right)
- Mobile: logo shortened to "LPS", game switcher is primary nav element
- Game switcher shows all active games the user is a member of (not completed games)

---

## Screen 1: Auth Page (`/auth`)

Single page with login/signup toggle. No separate pages.

**Layout:** Centered card on warm background. "Last Person Standing" in Fraunces at top. Subtitle: "Football survivor picks."

**Tabs:** "Sign in" | "Create account" — toggle between forms on the same page.

**Fields:**
- Sign in: email, password, submit button
- Create account: name, email, password, submit button

**Behaviour:**
- `callbackUrl` query param preserved through the toggle
- After auth, redirect to callbackUrl (for invite links) or `/` (dashboard)
- Inline field validation (empty email, password too short)
- Uses Better Auth client: `signIn.email()` / `signUp.email()`
- Error states: "Invalid credentials", "Email already registered"

---

## Screen 2: Dashboard (`/`)

The home page. No marketing text, no explanations. Your games at a glance.

**Data fetching:** Server Component — query game_player for current user, join game + competition + players.

### Game Cards

Each game shows:
- **Title** (Fraunces) + **status badge** (Alive green / Eliminated red / Winner gold)
- **Meta line:** mode · competition · player count · alive count · pot amount (Fraunces for pot)
- **Action line** (border-top separator):
  - Need to pick: amber background chip "Make your pick — GW25" + deadline countdown
  - Picked: green text "Picks submitted ✓" + round deadline
  - Eliminated/completed: no action line
- **Admin warning** (if game creator): "3 unpaid" in red text below action line

**Sorting:** Games sorted by action needed first (pick required), then active (picked), then completed (faded).

**Desktop:** Two-column grid for active games. Completed games full-width below.

**Mobile:** Single column, all stacked.

**Empty state:** "Create your first game" card with CTA button. Clean, not sad.

**One-game shortcut:** If user has exactly one active game with a pick needed, the dashboard card is expanded to show deadline prominently. Tapping goes straight to the game.

---

## Screen 3: Game Detail (`/game/[id]`)

The most complex screen. Adaptive layout.

**Data fetching:** Server Component — query game with competition, current round, players, picks, fixtures, form data.

### Desktop: Two-Column Layout

**Left column (wider, ~60%):** Pick interface for current round
**Right column (~40%):** Progress grid with metadata

### Mobile: Tabbed Layout

**Tabs:** Picks | Grid
- Picks tab: fixture list + pick confirm bar (default)
- Grid tab: progress grid with metadata and filter

### Navbar (game context)
- Back arrow → Dashboard
- Game switcher dropdown (shows other games)
- Share button (📤)
- Admin gear icon (mobile) or admin bar below navbar (desktop)

### Admin Bar (game creator only)

Amber background strip below navbar (desktop) or bottom sheet via gear icon (mobile).

**Content:** Status message ("GW24 complete · 2 eliminated · 3 unpaid") + action buttons:
- **Add player** — add a registered user to the game late
- **Make pick** — select a player, make a pick on their behalf (covers both late picks and late joins)
- **Payments** — panel showing paid/unpaid list, toggle status, send reminder
- **Split pot** — confirmation dialog with calculated payouts, ends game

**Add player flow:**
1. Tap "Add player"
2. Enter player's email (must be a registered user)
3. Player added to game as alive, payment record created if entry fee set

**Make pick for player flow:**
1. Tap "Make pick"
2. Select a player who hasn't picked for current round
3. See the same pick interface but acting on their behalf
4. Submit → pick recorded as admin-entered

**Payments flow:**
1. Tap "Payments"
2. Panel shows all players: name, paid/unpaid badge, toggle button
3. "X of Y paid" counter
4. "Send reminder" → WhatsApp share with unpaid player list

**Split pot flow:**
1. Tap "Split pot"
2. Confirmation dialog: "End game? X players share £Y (£Z each)"
3. Confirm → game completed, payouts recorded, game card updates

---

## Screen 3a: Classic Pick Interface

Shown in the left column (desktop) or Picks tab (mobile) of the game detail page.

### Round Header
- Round name ("Gameweek 25") in Fraunces
- Deadline countdown chip (amber): "⏱ 4h 22m"

### Fixture Rows

Each fixture is a row with two independently tappable sides:

**Home side (right-aligned):**
- Team name (bold)
- Form dots (last 6 W/D/L, green/amber/red squares with letter)
- League position + "Home" label
- Team badge (colour circle with abbreviation)

**Centre:**
- "vs" text
- Kickoff time

**Away side (left-aligned):**
- Team badge
- Team name (bold)
- Form dots (last 6)
- League position + "Away" label

**States:**
- **Default:** Neutral border, both sides tappable
- **Selected:** Tapped team's side gets green background + green border. Other side stays neutral.
- **Used:** Entire row greyed out (opacity 0.3), "Used GWx" label, not tappable

**Mobile form dots:** Truncated to last 3 to save space.

### Pick Confirm Bar

Sticky at bottom when a team is selected:
- Left: "Picking **Arsenal** vs Chelsea (H) · GW25"
- Right: "Lock in pick" button (green)

One-step undo: tap the selected team again to deselect.

### Pick Planner (Collapsible)

Below the current round fixtures. Toggle: "▾ Pick Planner" + "14 teams remaining"

**Remaining teams counter:** "14 teams remaining · Used: [mini badge circles of used teams]"

**Future rounds:** Each round shows full fixture list (not just team chips):
- Round header: "GW26 · Sat Jan 25" + "10 days"
- Fixture rows (compact version): both teams tappable, form dots (last 3), team badges
- Used teams greyed + strikethrough (includes current selection + previous rounds + planned picks in earlier future rounds)
- Planned pick: purple dashed border on the selected team's side
- Auto-submit toggle in round footer: "Auto-submit **Chelsea** at deadline" with on/off toggle

**Cascading used teams:** Planning Chelsea in GW26 → Chelsea greyed out in GW27+. Removing the plan reverses this.

**Rounds without fixtures:** "GW28 — Fixtures TBC" (non-interactive, faded)

---

## Screen 3b: Turbo Pick Interface

Shown for turbo mode games. Two-zone layout.

### Top Zone: Ranked Predictions

Ordered list of fixtures the user has predicted, ranked by confidence:

Each item shows:
- Drag handle (⠿)
- Rank number (1-10). Top 3 highlighted green.
- Fixture: home badge + name vs away badge + name
- Prediction badge: HOME (blue) / DRAW (amber) / AWAY (red)
- Up/down arrow buttons (single-position nudge)

**Reordering interactions:**
1. **Drag-and-drop** — primary, grab via drag handle
2. **Up/down arrows** — fallback, one position per tap
3. **Long-press** — power move, opens "Move to position..." number picker

**Changing a prediction:** Tap the prediction badge (HOME/DRAW/AWAY) → inline H/D/A toggle appears → tap new prediction → badge updates. No need to remove and re-add.

**Removing a prediction:** Swipe left to reveal "Remove" (mobile) or × on hover (desktop). Fixture moves back to remaining section.

### Bottom Zone: Remaining Fixtures

Fixtures the user hasn't predicted yet. Each shows:
- Both teams with badges, form dots (last 3), league position
- **H / D / A** toggle buttons below the fixture
- Tap a prediction → "↑ Add to predictions as #N" link appears → tap to add to ranked list at the bottom

### Confirm Bar

Sticky at bottom:
- Left: "**6** of 10 predictions ranked"
- Right: "Lock in picks" button — disabled until all 10 are ranked, green when ready

---

## Screen 3c: Cup Pick Interface

Same as turbo with two additions:

### Tier Indicators

Each fixture shows a tier indicator in the centre:
- **Pip bar:** 1-5 filled pips visualising the tier gap
- **Number:** "+5", "+3", "+2", "+1" or "Same tier"
- **Heart icon (❤️):** Only appears when tier difference is 2+ (life-earning potential)
- **Colour:** Amber/warm for life-earning fixtures (2+), grey for no-life fixtures (0-1)
- **League labels:** Each team shows their league name instead of form dots (form less relevant for cross-league cup ties)

### Pick Restrictions

When a team's tierDiffFromPicked would be >1 (heavy favourite):
- That team's side is greyed out and not tappable
- Tooltip/label: "Cannot pick — opponent is X tiers below"

### Lives Display

At the top of the pick section:
- Hearts showing current lives: ❤️❤️🤍 (filled = available, empty = spent/not earned)
- Projection text: "1 life · If all correct: would gain 2 → 3 lives" — updates as you reorder

### Tier in Ranked List

The pip bar + heart carry into each ranked prediction item, showing life-earning potential as you reorder.

---

## Screen 4: Create Game (`/game/create`)

Progressive disclosure form — sections reveal as you fill in previous ones.

### Step 1: Game Name (always visible)
- Text input, placeholder "e.g. The Lads LPS"

### Step 2: Competition (revealed after name entered)
- Select dropdown populated from DB
- Options: "Premier League 2025/26" and any other synced competitions

### Step 3: Game Mode (revealed after competition selected)
- Three cards, horizontal on desktop, vertical on mobile:
  - **Classic:** "One pick per round. Win to survive. Last person standing."
  - **Turbo:** "Predict 10 fixtures ranked by confidence. Highest streak wins."
  - **Cup:** "Predict cup fixtures. Lives system with tier handicaps."

### Step 4: Settings (revealed after mode selected)
- **Entry fee:** "No entry fee" toggle. When off: stepper £10 / £20 / £30 etc (multiples of 10, + / - buttons, default £10)
- **Cup only:** Starting lives (number stepper, default 0), number of picks (default 10)
- **Turbo only:** Number of picks (default 10)

### Step 5: Create Button
- Disabled until name + competition + mode selected
- On submit: creates game, redirects to game detail page
- Game detail shows invite link prominently: "Share this link to invite players" + copy button + WhatsApp share

---

## Screen 5: Join Game (`/join/[code]`)

Minimal friction flow from invite link.

**Not logged in:** Redirect to `/auth?callbackUrl=/join/[code]`. After auth, back to join.

**Logged in, not a member:** Show game card:
- Game name, mode, competition, player count, entry fee, creator name
- "Join Game" button (one tap)
- If entry fee: note "£10 entry fee — admin will collect payment separately"
- After joining: redirect to `/game/[id]`

**Logged in, already a member:** Redirect straight to `/game/[id]`

---

## Screen 6: Progress Grid

The central game artefact. Shown in the right column (desktop) or Grid tab (mobile).

### Grid Header
- "Progress" title
- Metadata: "9 alive · 5 eliminated · £140 pot"

### Filter
- Button group: "All" | "Last 5" | "Last 3"
- Default: "All" on desktop, "Last 5" on mobile (since ~10 rounds fits a phone)

### Grid Table
- **Columns:** Player name | Round 1 | Round 2 | ... | Round N | Status
- **Cells:** Team abbreviation (3 letters) inside a coloured rectangle:
  - Win: green background
  - Loss: red background
  - Draw: amber background
  - Pending (current round, picked): blue background
  - Not picked yet: "?" in amber
  - After elimination: skull emoji (💀) at elimination point, empty cells after
- **Rows:**
  - Alive players at top, sorted by join order
  - Eliminated players below, faded (opacity 0.4), sorted by elimination round (most recent first)
- **Status column:** "alive" (green badge) or "GW23" (red badge, elimination round)

### Mobile Grid
- Compact cells (smaller text)
- Sticky first column (player names)
- Horizontally scrollable if needed (with Last 5 filter, usually fits)
- Status column: ✓ for alive, round number for eliminated

### This Grid IS the Shareable Image
The same data, rendered server-side via Satori for WhatsApp sharing. With match day status overlaid at the top when matches are live.

---

## Component Architecture

```
src/components/
  ui/                    # shadcn primitives (button, card, badge, tabs, dialog, etc.)
  theme/
    theme-provider.tsx   # next-themes wrapper
    theme-toggle.tsx     # light/dark mode toggle
  nav/
    navbar.tsx           # top navigation bar
    game-switcher.tsx    # dropdown to switch between games
    user-menu.tsx        # avatar + dropdown (settings, sign out)
  game/
    game-card.tsx        # dashboard game card
    status-badge.tsx     # alive/eliminated/winner badge
    payment-badge.tsx    # paid/unpaid indicator
    create-game-form.tsx # progressive disclosure form
    join-game.tsx        # join game card
  picks/
    fixture-row.tsx      # fixture with both teams tappable + form dots
    fixture-row-compact.tsx  # compact version for planner
    team-badge.tsx       # club badge (colour circle + abbreviation)
    form-dots.tsx        # W/D/L last N results as coloured squares
    pick-confirm-bar.tsx # sticky bottom bar for classic picks
    ranking-list.tsx     # turbo/cup ranked predictions with drag/reorder
    prediction-buttons.tsx   # H/D/A toggle buttons
    tier-indicator.tsx   # cup mode pip bar + heart
    pick-planner.tsx     # classic mode future round planner
  standings/
    progress-grid.tsx    # players × rounds grid
    grid-filter.tsx      # All/Last 5/Last 3 filter buttons
    lives-display.tsx    # cup mode hearts + projection
  admin/
    admin-bar.tsx        # amber contextual admin controls
    late-pick-dialog.tsx # pick on behalf of player
    add-player-dialog.tsx    # add player to game
    payments-panel.tsx   # paid/unpaid tracking
    split-pot-dialog.tsx # end game confirmation
```

**Data fetching pattern:**
- **Server Components** for page-level data (dashboard, game detail) — direct Drizzle queries
- **Client Components** for interactive parts (pick selection, form submission, ranking) — call API routes for mutations
- **Polling** for live data (match day scores) — client-side fetch on interval

---

## Responsive Breakpoints

**Mobile-first.** Single breakpoint at `768px` (md):

| Element | Mobile (<768px) | Desktop (≥768px) |
|---------|-----------------|-------------------|
| Dashboard games | Single column | Two-column grid |
| Game detail | Tabs (Picks / Grid) | Two-column (picks left, grid right) |
| Navbar logo | "LPS" | "Last Person Standing" |
| Navbar actions | Compact icons | Text labels |
| Form dots | Last 3 | Last 6 |
| Fixture rows | Compact spacing | Full spacing |
| Admin controls | Bottom sheet via gear icon | Inline amber bar |
| Progress grid | Last 5 default, compact cells | All rounds default |

---

## Empty States

| Scenario | What's Shown |
|----------|-------------|
| No games | "Create your first game" CTA card |
| Game with no fixtures for round | "Fixtures not yet confirmed" message |
| No form data | Fixtures shown without form dots, "Form data updating..." |
| No live scores | "Waiting for kickoff" or "Scores updating..." |
| Player hasn't picked | "?" in amber on progress grid |
| No picks submitted for round | "No picks yet for this round" |

---

## Data Dependencies (Frontend ↔ Backend)

The frontend depends on data that comes from the sync pipeline (Plan 4):

| Data | Source | Sync Mechanism | Frontend Impact if Missing |
|------|--------|---------------|---------------------------|
| Teams + badges | FPL API / football-data.org | Cron: sync-fpl | No team badges, abbreviations |
| Fixtures per round | FPL API | Cron: sync-fpl | Pick page shows "Fixtures TBC" |
| Round deadlines | FPL API | Cron: sync-fpl | No countdown, deadline not enforced |
| Form guide (W/D/L) | football-data.org | Cron: sync-form (Plan 4) | Pick page works but no form dots |
| Live scores | football-data.org | Cron: poll-scores | No match day live view |
| League standings | football-data.org | Cron: sync-form (Plan 4) | No league position on fixtures |

**Plan 4 must deliver:** Vercel cron configuration, form guide sync job, initial data bootstrap, FOOTBALL_DATA_API_KEY + CRON_SECRET env setup.

The frontend should be buildable and testable with seed data from Plan 1. Real data comes when the pipeline is wired in Plan 4.
