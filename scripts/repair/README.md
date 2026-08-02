# One-off prod repair scripts

Approved production repairs from the #112 parent spec, each with a
read-only inspector to verify it. Prod execution is gated on human
sign-off: the agent delivers the scripts and dry-run evidence; **a human
runs `--apply`**.

Convention: every mutating script is dry-run by default, prints every
intended mutation, asserts hard preconditions against live data (any drift
aborts loudly with no writes), and only mutates with an explicit `--apply`
flag — all writes in a single transaction.

All commands run from the repo root. WSL note: run outside any network
sandbox (Neon DNS is blocked in it); Neon idle-suspends, so retry once on
an initial `ETIMEDOUT`.

## Issue #122 — 2026/27 rollover execution + GW1 verification

The auto-rollover itself is deployed code (#132): the daily-sync run detects
the season from football-data's `currentSeason` cross-checked against FPL's
GW1 deadline, creates "Premier League 2026/27", and archives the predecessor
— all before any sync writes. This runbook *triggers* that deployed path
once, verifies GW1-readiness with the read-only inspector, and only then
re-arms the schedule (manually disabled 2026-08-01 to stop the corruption).

`inspect-pl-rollover.ts` is season-agnostic (it derives the expected season
from the sources), read-only, and exits non-zero on any failed check — it is
also the perennial verification tool for every future August (see AGENTS.md
"PL season rollover").

### Runbook (human, in order)

```bash
# 0. Pre-flight — sources ready, tla coverage, prod baseline. Expect
#    "Baseline OK (pre-rollover)" and zero ✖ marks.
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-rollover.ts

# 1. Run the deployed auto-rollover: mirror the daily-sync workflow by hand
#    (fetch FPL payloads locally — FPL's Cloudflare blocks Vercel egress —
#    and POST them to the deployed route). Expect HTTP 200 with a
#    competitions array; the rollover logs land in Vercel function logs.
curl -sSf -o /tmp/bootstrap.json https://fantasy.premierleague.com/api/bootstrap-static/
curl -sSf -o /tmp/fixtures.json https://fantasy.premierleague.com/api/fixtures/
jq -cn --slurpfile b /tmp/bootstrap.json --slurpfile f /tmp/fixtures.json \
  '{fpl: {bootstrap: $b[0], fixtures: $f[0]}}' > /tmp/payload.json
doppler run -p last-person-standing -c prd -- bash -c '
  curl -sS --fail-with-body -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/payload.json \
    -w "\nHTTP %{http_code} in %{time_total}s\n" \
    https://last-person-standing.app/api/cron/daily-sync'

# 2. Verify — expect "ALL CHECKS PASSED" (38 rounds / 380 fixtures / 20
#    teams, GW1 pairings matching FPL + football-data, promoted clubs with
#    football-data crests + colour entries, 2025/26 archived + untouched).
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-rollover.ts

# 3. UI spot-checks on https://last-person-standing.app:
#    - Create a classic game on "Premier League 2026/27" → it must attach to
#      a pickable Gameweek 1 (deadline 2026-08-21 17:30 UTC).
#    - On the pick screen, Coventry / Hull / Ipswich render real crests and
#      their club colours (light blue / amber / blue), not the grey fallback.

# 4. Only after 2 + 3 pass: re-enable the daily-sync schedule.
gh workflow enable daily-sync.yml

# 5. Next morning (schedule fires 04:00 UTC, free tier can lag 30–60 min):
#    confirm the scheduled run is green, then re-run the inspector — the
#    2025/26 census must be unchanged (archived competitions are immutable).
gh run list --workflow=daily-sync.yml --limit 3
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-rollover.ts
```

If step 1 or 2 fails: do **not** enable the workflow. A
`SeasonDetectionError` means the sources disagree (zero writes happened); a
`mergeFootballDataIds` team-coverage error names the club whose FPL/fd
3-letter codes mismatch — add it to `FPL_TO_FD_TLA` in
`src/lib/game/bootstrap-competitions.ts`, deploy, and re-run from step 1.

## Issue #121 — 2025/26 PL season restore + archive

The pre-#124 nightly sync matched fixtures on globally-unique external
ids; when FPL flipped to 2026/27 it rewrote all 380 of the 2025/26
season's fixture rows in place (2026/27 kickoffs, wiped scores, colliding
FPL ids — team pairings untouched). `restore-pl-2526-season.ts` restores
the season from football-data's archive (`?season=2025`) and archives the
competition. Requires `FOOTBALL_DATA_API_KEY` (in Doppler `prd`).

### Runbook (human, in order)

```bash
# 0. Baseline — read-only census of the competition + its games
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-2526-restore.ts

# 1a. Restore + archive — dry run, review the printed mutations
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/restore-pl-2526-season.ts
# 1b. ...then apply
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/restore-pl-2526-season.ts --apply

# 2. Re-run the inspector and check against the acceptance criteria below
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-2526-restore.ts
```

Expected inspector output after apply (issue #121 acceptance criteria):

- Fixture census: **380 finished** fixtures, **0 missing scores**,
  **380 kickoffs inside the 2025/26 window** (0 outside, 0 null),
  **0 carrying an FPL id**, **380 carrying a football-data id**.
- The GW1 listing opens with **LIV 4-2 BOU, kickoff 2025-08-15**; the
  GW38 listing shows ten finished fixtures all kicking off 2026-05-24.
- Every round shows a 2025/26 deadline (earliest kickoff − 90 min).
- Competition **status=archived**.
- "Last Day Lightning 26" picks list real scores and kickoffs on their
  fixtures.

Then verify the game page renders through real SSR (curl recipe in the
issue-#119 section below, with the game id from the inspector output) and
spot-check a few printed scores across the season against
football-data / BBC.

## Issue #119 — World Cup endgame repairs

Two approved production repairs from the World Cup endgame incidents,
plus a read-only inspector to verify them.

### Runbook (human, in order)

```bash
# 0. Baseline — read-only census of both games
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-wc-repair.ts

# 1a. World Cup LPS record correction — dry run, review the printed mutations
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/repair-wc-lps-endgame.ts
# 1b. ...then apply
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/repair-wc-lps-endgame.ts --apply

# 2a. SI World Cup husk deletion — dry run, review the printed rows
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/delete-si-world-cup.ts
# 2b. ...then apply
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/delete-si-world-cup.ts --apply

# 3. Re-run the inspector and check against the acceptance criteria below
doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-wc-repair.ts
```

Expected inspector output after both applies (issue #119 acceptance
criteria):

- The R5 Round of 16 `COL` pick shows `loss`; its owner is eliminated in
  **R5 Round of 16** (reason `loss`), with their R6 Quarter-finals pick row
  still present as history.
- The previously pickless finalist is **eliminated in R8 Final** (reason
  `no_pick_no_fallback`); exactly **one** player has status `winner`.
- Payouts: exactly one row, **£160.00, `isSplit=false`** — no split rows.
- All 62 World Cup LPS pick rows still present (only the one stuck pick's
  result changed).
- SI World Cup reports **`Game NOT FOUND (deleted...)`**.

### Authenticated page check (final acceptance criterion)

Verify the corrected game page renders through real SSR without errors
(headless browsers are usually blocked here; use the curl recipe):

```bash
# Sign in (any account that is a member of the game) and keep the cookie
curl -s -c /tmp/lps-cookies.txt -H 'content-type: application/json' \
  -d '{"email":"<email>","password":"<password>"}' \
  https://last-person-standing.app/api/auth/sign-in/email >/dev/null

# SSR-fetch the corrected game page — expect HTTP 200
curl -s -b /tmp/lps-cookies.txt -o /tmp/lps-game.html -w '%{http_code}\n' \
  https://last-person-standing.app/game/dc857c5f-8a07-4c3b-aeef-71d9883a218e

# Expect 0 error markers
grep -ci 'application error\|internal server error' /tmp/lps-game.html
```

Also confirm the deleted game is gone from the signed-in dashboard listing.

These scripts are single-use: once applied and verified, their
preconditions can never pass again (each aborts loudly if re-run).
