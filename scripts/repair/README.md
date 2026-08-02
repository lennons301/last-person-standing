# One-off prod repair scripts — issue #119

Two approved production repairs from the World Cup endgame incidents
(parent spec: #112), plus a read-only inspector to verify them. Prod
execution is gated on human sign-off: the agent delivers the scripts and
dry-run evidence; **a human runs `--apply`**.

Convention: every mutating script is dry-run by default, prints every
intended mutation, asserts hard preconditions against live data (any drift
aborts loudly with no writes), and only mutates with an explicit `--apply`
flag — all writes in a single transaction.

## Runbook (human, in order)

All commands run from the repo root. WSL note: run outside any network
sandbox (Neon DNS is blocked in it); Neon idle-suspends, so retry once on
an initial `ETIMEDOUT`.

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

## 4. Authenticated page check (final acceptance criterion)

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
