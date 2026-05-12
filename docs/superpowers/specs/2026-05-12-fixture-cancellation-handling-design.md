# Fixture cancellation handling

**Status:** Designed 2026-05-12. Implementation queued as a follow-up PR to PR #45.
**Author:** Claude, paired with Sean.
**Cross-references:** `docs/superpowers/specs/2026-05-12-per-fixture-settlement-and-live-projection-design.md` (the per-fixture settlement architecture this builds on).

---

## tl;dr

Per-fixture settlement (PR #45) lands picks on `pending → win/loss/draw/saved_by_life` whenever a fixture flips to `finished`. Cancelled and postponed fixtures never reach `finished`, so picks on them get stuck `pending` forever. This doc specifies how to settle picks on fixtures that never play — including the threshold logic for voiding a whole round.

---

## Scope: what counts as "cancellation"

football-data's `status` enum covers more than just "cancelled":

| football-data status | Treatment |
| --- | --- |
| `POSTPONED` | **Auto-cancel.** Postponed PL fixtures get rescheduled to other matchdays anyway; survivor games need to roll over rather than block. |
| `CANCELLED` | Cancel. Fixture won't be played. |
| `SUSPENDED` | Treat as `live` for now; if it ends as `AWARDED` or `CANCELLED` later, that settles it. |
| `AWARDED` | **Normal settle.** Federation-decided result still has a winner. Pick.result = win/loss based on awarded winner; goals counted at face value (typically 3-0 by convention). |

So in this design, "cancellation" means any fixture that ends in `CANCELLED` or `POSTPONED` (because postpone → auto-cancel). Awarded matches are not cancellations.

---

## Schema changes

### `pick.result` gains `'void'`

```sql
ALTER TYPE pick_result ADD VALUE 'void';
```

Distinct semantic state. Queries that count "settled" picks should use `result IN ('win', 'loss', 'draw', 'saved_by_life')` — voids are deliberately excluded.

### `fixture.status` gains `'cancelled'`

```sql
ALTER TYPE fixture_status ADD VALUE 'cancelled';
```

Replaces `'postponed'` for the operational state after settlement decides postponement = cancellation. `'postponed'` enum value stays for backwards compat with adapter intermediates but the settlement pipeline normalises both to `'cancelled'`.

### `round` gains an optional voided marker

Add `round.voided_at: timestamp | null`. Set when the round-void threshold (below) fires. Doesn't change `round.status` — that still flips to `'completed'`, but the void timestamp lets the UI render the prominent "round voided" treatment without inferring it.

### `pick` gains `cancellation_reason: text | null`

For the timeline + audit trail. Free text — typically `'postponed'` / `'cancelled'` / `'round-voided'`.

---

## Per-mode policy

### Classic

A classic pick whose fixture is cancelled:

1. `pick.result = 'void'`.
2. `pick.cancellation_reason = 'postponed' | 'cancelled'`.
3. Player **stays alive**. No elimination.
4. **Team is marked as used** (consumed). Player can't re-pick that team in a later round.

Rationale: player committed to the team strategically. Releasing the team would let them bank stronger teams for harder rounds with hindsight — gameable.

### Turbo

A turbo pick whose fixture is cancelled:

1. `pick.result = 'void'`.
2. `pick.cancellation_reason` populated.
3. Streak evaluation walks past voided picks as if they weren't there. Ranks 1–4 plus rank 6 settle normally; rank 5 contributes 0 to streak and 0 goals.
4. Effectively the player plays a 9-pick game (for a single cancellation).

Rationale: no result to predict means no skill to credit or debit. Skip is the only mathematically clean answer.

### Cup

A cup pick whose fixture is cancelled:

1. `pick.result = 'void'`.
2. `pick.cancellation_reason` populated.
3. `pick.life_gained = 0`, `pick.life_spent = false`.
4. `reevaluateCupGame` iterates rank-ordered and skips voided picks. Streak/lives state at the next rank is whatever it was at the previous non-voided rank.

Same rationale as turbo.

---

## Round-void threshold (classic only)

When the cancellations in a round are too widespread, void the whole round.

### Trigger

Fires when, after settling a cancellation, EITHER of:

- More than **50%** of the round's fixtures are voided (status = `'cancelled'`); OR
- More than **5** fixtures in the round are voided (absolute count, covers cases where 50% wouldn't fire on a small round).

A 10-fixture PL gameweek triggers at 6 cancellations (60% > 50%, also > 5).
An 8-fixture WC matchday triggers at 5 (62.5% > 50%).
A 4-fixture knockout round triggers at 3 (75% > 50%; absolute count never reaches 6 but percentage suffices).

### Behaviour

1. `round.voided_at = NOW()`.
2. `round.status = 'completed'` (so game advancement fires).
3. Every pick on the round, including any already-settled ones (win/loss/draw): `pick.result = 'void'`, `pick.cancellation_reason = 'round-voided'`, team usage **released**. The round effectively didn't happen — including for picks that had real outcomes.
4. All alive players carry forward — no eliminations from this round.
5. Game advances to next round per the standard `advanceGameToNextRound` flow.

### Turbo / cup equivalents

No automatic round-void. If a real situation calls for one, admin intervenes via the existing `/api/games/[id]/admin/refund-payments` endpoint and (where appropriate) marks the game `completed` with no winner. The user's call: the per-mode mechanics in turbo/cup make a clean carry-forward harder to define, and admin judgement is sufficient given the rarity.

---

## Trigger surface

Settlement logic extended:

- `settleFixture(fixtureId)` checks the new fixture status. If `cancelled` (or `postponed` normalised to cancelled), call `voidFixture(fixtureId)` instead of the existing settle paths.
- `voidFixture(fixtureId)` is the new helper — applies the per-mode void policy, persists `pick.result = 'void'`, marks teams consumed (classic), then:
  - Checks the round-void threshold for classic competitions.
  - If threshold crossed: `voidWholeRound(roundId)` — iterates every pick on the round, voids them all, releases teams, sets `round.voided_at`, advances games on that round.

Same set of call sites as existing settle: live-poll observation, syncCompetition mirror, reconcile sweep.

---

## UI surface

### Per-pick voided picks

- **Progress grid / cup grid / turbo cells:** voided picks render with a dedicated visual — a soft blue tile with a "VOID" or "—" label. Distinct from `pending` (which is neutral grey), distinct from win/loss/draw colours. The one cell-state where we deliberately diverge from the "settled-style visual" rule, because there's no settled equivalent.
- **Banner on game-detail page:** when the viewer has a voided pick on the current or most recent round, show a dismissible banner at the top. Content varies by mode:
  - Classic: "Brighton vs Wolves was cancelled. Your pick has been voided — you stay alive and the team is locked from re-use."
  - Turbo: "Brighton vs Wolves was cancelled. Your rank-5 pick is voided and doesn't count towards your streak."
  - Cup: "Brighton vs Wolves was cancelled. Your rank-5 pick is voided — no life gained or spent."
- **Timeline event:** every void writes an event row for audit + future history view.

### Round-void (classic only)

More prominent than per-pick:

- The voided round's column in the progress grid renders with a striped background and a "ROUND VOIDED" header above the round label.
- All cells in that column render as void (regardless of whether the underlying picks settled before the threshold fired).
- Banner is non-dismissible until acknowledged: "Round X was voided — too many fixtures cancelled. All players carry forward to Round X+1."

---

## Edge cases

1. **Cancellation arrives after the round already advanced.** Late `CANCELLED` status on a fixture in a `completed` round. Picks on that fixture have already been settled (win/loss/draw). Decision: **do not retroactively void.** Late cancellations are logged as a warning but don't reverse settled state — too disruptive once players have seen the result. Surface as ops alert.

2. **Cancellation in a round that's not the game's current round.** Possible during bulk-sync after a long outage. Same as above: only void picks whose round hasn't completed yet.

3. **Threshold crossed mid-fixture sequence.** If 5 fixtures finish normally and the 6th cancels, pushing the round over the threshold, the 5 already-settled picks get retroactively voided (per the "void the whole round" rule). This IS a behaviour change for the settled picks. Justified because the round outcome is now meaningless — no winner can be fairly determined.

4. **Race: cancellation + live-poll both writing the fixture.** Idempotent guards apply: `voidFixture` checks `pick.result === 'pending'` before voiding (don't overwrite a settled pick). Order-of-operations: if a fixture flips finished and then cancelled (unusual but possible — corrected adapter data), settled state wins.

5. **Mass-cancellation at game-creation time.** If a competition has historical voids when a new game is created, the picks created on those voided fixtures inherit `'void'` immediately. UI shows them as such from the start.

---

## Implementation plan

Single PR after #45 merges. Internal ordering:

1. Schema: add `'void'` to `pickResultEnum`, `'cancelled'` to `fixtureStatusEnum`, `round.voided_at` column, `pick.cancellation_reason` column.
2. `voidFixture(fixtureId)` helper in `src/lib/game/settle.ts`. Per-mode dispatch.
3. `voidWholeRound(roundId)` helper. Threshold check.
4. Wire into `settleFixture` (route by fixture status: finished → existing settle path; cancelled/postponed → void path).
5. Update `getLivePayload` projection: voided picks return `projectedOutcome: 'void'`. Player aggregates exclude voided picks from streak math.
6. UI: add `void` cell variant to progress-grid + cup-grid + turbo-ladder. Banner component for voided picks. Round-voided column treatment.
7. Smoke scenarios:
   - Classic: single voided pick → player alive + team consumed.
   - Classic: 6 voided fixtures in a 10-fixture round → round voided, all alive carry forward, teams released.
   - Turbo: voided rank-5 pick → streak walks past, ranks 1-4 + 6-10 count normally.
   - Cup: voided rank-3 pick → re-eval skips it, lives state at rank 4 matches rank 2 state.
   - Awarded match settles normally with face-value goals.
8. Update `docs/game-modes/{classic,turbo,cup}.md` cancellation sections.

---

## Decisions captured

| Question | Decision |
| --- | --- |
| Postponed fixtures | Auto-cancel (don't wait for reschedule) |
| Awarded matches | Normal settle (face-value goals) |
| Schema representation | New `'void'` enum value on `pickResultEnum` |
| Classic policy | Free pass, team consumed |
| Turbo policy | Auto-skip (streak walks past) |
| Cup policy | Auto-skip (re-eval walks past) |
| Refunds | Out of scope (admin operation) |
| Round-void threshold (classic) | >50% OR >5 absolute → whole round voided, all alive carry forward, teams released |
| Round-void (turbo / cup) | Admin refunds; no automatic round-void |
| UI per-pick | Distinct "void" cell visual + dismissible banner on game page + timeline event |
| UI round-void | Prominent column treatment + non-dismissible banner until acknowledged |
