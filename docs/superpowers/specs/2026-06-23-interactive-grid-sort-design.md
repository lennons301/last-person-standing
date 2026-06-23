# Interactive progress-grid sort + shareable gameweek-pick view

## Problem

PR #85 added classic-grid sorting, but only via a separate "Sort" button group
(`GridSortControl`) for three dimensions (status / goals / name). The grid's own
column headers are inert. The chief unmet need: sort players by **a given
gameweek's picked team, alphabetically**, so identical picks cluster ("5 people
on Arsenal") — and share that view. The shared image must reflect the sort and a
show/hide-eliminated choice.

## Design

### A. On-screen grid (`src/components/standings/progress-grid.tsx`)
- Remove `GridSortControl`. Make every column header a sort control:
  - **Player** → name; **Gls** → goals; **Status** → alive-first/survived-longest;
    **each GW column** → that round's picked team.
  - Active header shows ▲/▼; clicking it again reverses direction. Default `status`.
- Keep the existing Hide-eliminated / Show-opponents / Share / filter controls.
- Sort state becomes a descriptor: `{ key: 'name'|'goals'|'status'|'round'; roundId?: string; dir: 'asc'|'desc' }`.

### B. Sort engine (`src/components/standings/grid-sort.ts`)
- `sortGridPlayers(players, sort)` where `sort` is the descriptor above. Pure, non-mutating.
- `'round'`: order by `cellsByRoundId[roundId]?.teamShortName` (A–Z asc / Z–A desc);
  players with no team (no_pick / void / empty / locked / skull) sink to the bottom;
  tiebreak player name A–Z.
- `'name'|'goals'|'status'`: today's rules, with `dir` applied (default direction
  preserved: name A–Z, goals high→low, status alive-first).

### C. Shared image carries sort + eliminated filter
- `ShareDialog` (`src/components/game/share-dialog.tsx`) appends the grid's current
  state to the standings image URL:
  `?sort=<name|goals|status|round>&round=<id>&dir=<asc|desc>&aliveOnly=<0|1>`.
  `aliveOnly` = the Hide-eliminated toggle. The sort/filter travel from `ProgressGrid`
  up via the `onShare` callback (now `onShare(params)`), stored in
  `game-detail-view.tsx` and handed to `ShareDialog`.
- Share route (`src/app/api/share/standings/[gameId]/route.tsx`) parses those params
  and passes them to `getShareStandingsData(gameId, userId, { sort, aliveOnly })`.
- `getShareStandingsData` (`src/lib/share/data.ts`) applies `sortGridPlayers` + the
  `aliveOnly` filter to the classic grid players, and flags `flat = sort.key === 'round'`.
- `classic-standings.tsx`:
  - **flat (GW-pick sort)** → one list, no Alive/Eliminated split, in the given order,
    cap ~30, last-6-rounds.
  - **otherwise** → today's Alive-then-Eliminated split.
  - `aliveOnly` drops eliminated players from the image in either layout.

### Behaviour summary
- Post-gameweek: share with eliminated **included** → flat list grouped by team, so you
  see who went out and on what.
- Upcoming-pick sharing: flip **Hide eliminated** → image is alive-only.

## Testing
- Unit (`grid-sort.test.ts`): the new `'round'` sort (team A–Z, no-team last, name
  tiebreak), direction toggle for every key.
- Unit (`share/data.test.ts`): `getShareStandingsData` applies sort + aliveOnly and
  sets `flat` for round sorts (mocked `getProgressGridData`).
- Smoke or route test: share-standings route parses params → ordered/filtered data.
- UI: load the game page in the dev server, click a GW header, confirm grouping +
  ▲/▼, open Share dialog and confirm the image order matches (per the verify-UI rule).

## Out of scope
- Per-round sort by *result* (win/loss ranking) — only by picked team.
- Turbo/cup standings sorting (single-round; not the ask).
