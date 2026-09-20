/**
 * Issue #275 — settled picks carrying goals the fixture no longer shows.
 *
 * `pick.goals_scored` is a snapshot taken at the instant its fixture first read
 * `finished`, and until this PR nothing rewrote it when the source corrected
 * that score: a goal given and then disallowed left the picked team a goal up
 * on the scoreline printed beside it (Everton 1-0 Ipswich rendering as two
 * goals on the progress grid). The code fix stops it happening again; this
 * script brings the rows that already drifted back into line.
 *
 * Nothing here decides anything of its own. Every pick is re-scored by the same
 * rule that settled it — `resolveClassicPickResult` for classic, the settlement
 * module's own `settleTurboPick` for turbo — against the fixture as it now
 * stands, and only the goals are written:
 *
 *   - **goals drift** (the result is unchanged, the goals are not) — the repair.
 *   - **result drift** (the fixture now scores the pick differently) — printed
 *     and never written: putting a player out, or reviving one, is a human's
 *     call and not a script's.
 *   - **completed games** — printed separately and never written. Those goals
 *     are the tiebreak that decided a pot that has already been paid.
 *
 * Cup games are out of scope: cup re-evaluates its whole gameweek on every
 * settle, so a corrected score already reaches its rows.
 *
 * Read-only by default — it prints every intended mutation. Pass --apply to
 * write, which it does in a single transaction.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { isKnockoutRound, resolveClassicPickResult } from '../../src/lib/game/classic-survival'
import { resolveModeConfig } from '../../src/lib/game/mode-config'
import { settleTurboPick } from '../../src/lib/game/settlement-plan'
import { pick } from '../../src/lib/schema/game'

const APPLY = process.argv.includes('--apply')

interface Drift {
	pickId: string
	gameName: string
	gameStatus: string
	mode: string
	roundLabel: string
	playerLabel: string
	scoreline: string
	storedResult: string
	storedGoals: number
	derivedResult: string
	derivedGoals: number
}

function line(d: Drift): string {
	return (
		`  ${d.gameName} [${d.mode}/${d.gameStatus}] ${d.roundLabel} — ${d.playerLabel}: ` +
		`${d.scoreline} | ${d.storedResult} goals ${d.storedGoals} → ${d.derivedResult} goals ${d.derivedGoals}` +
		`  (pick ${d.pickId})`
	)
}

async function main() {
	const games = await db.query.game.findMany({ with: { competition: true } })
	const goalsDrift: Drift[] = []
	const resultDrift: Drift[] = []
	const completedGameDrift: Drift[] = []
	let scanned = 0

	for (const g of games) {
		const modeConfig = resolveModeConfig(g)
		if (modeConfig.mode === 'cup') continue

		const picks = await db.query.pick.findMany({
			where: eq(pick.gameId, g.id),
			with: {
				round: true,
				team: true,
				fixture: { with: { homeTeam: true, awayTeam: true } },
			},
		})

		for (const p of picks) {
			// Only a settled pick on a finished fixture holds a figure to check: a
			// `void` row's 0 is deliberate and a `pending` one has yet to be scored.
			if (p.result === 'pending' || p.result === 'void') continue
			const fx = p.fixture
			if (!fx || fx.status !== 'finished' || fx.homeScore == null || fx.awayScore == null) continue
			scanned++

			const derived =
				modeConfig.mode === 'classic'
					? resolveClassicPickResult(
							{ teamId: p.teamId },
							{
								homeTeamId: fx.homeTeamId,
								awayTeamId: fx.awayTeamId,
								homeScore: fx.homeScore,
								awayScore: fx.awayScore,
								winner: fx.winner,
								status: fx.status,
								knockout: isKnockoutRound(g.competition.type, p.round.number),
							},
						)
					: settleTurboPick(p, {
							id: fx.id,
							homeTeamId: fx.homeTeamId,
							awayTeamId: fx.awayTeamId,
							homeScore: fx.homeScore,
							awayScore: fx.awayScore,
							winner: fx.winner,
							status: fx.status,
						})
			if (derived.result == null) continue

			const storedGoals = p.goalsScored ?? 0
			const drift: Drift = {
				pickId: p.id,
				gameName: g.name,
				gameStatus: g.status,
				mode: modeConfig.mode,
				roundLabel: p.round.name ?? `Round ${p.round.number}`,
				playerLabel: `${p.team?.shortName ?? p.teamId} (player ${p.gamePlayerId.slice(0, 8)})`,
				scoreline: `${fx.homeTeam.shortName} ${fx.homeScore}-${fx.awayScore} ${fx.awayTeam.shortName}`,
				storedResult: p.result,
				storedGoals,
				derivedResult: derived.result,
				derivedGoals: derived.goalsScored,
			}

			if (derived.result !== p.result) resultDrift.push(drift)
			else if (derived.goalsScored !== storedGoals) {
				if (g.status === 'completed') completedGameDrift.push(drift)
				else goalsDrift.push(drift)
			}
		}
	}

	console.log(
		`Scanned ${scanned} settled pick(s) on finished fixtures across ${games.length} game(s)`,
	)
	console.log('')

	console.log(`Goals drift on live games — ${goalsDrift.length} row(s) to correct:`)
	for (const d of goalsDrift) console.log(line(d))
	if (goalsDrift.length === 0) console.log('  (none)')
	console.log('')

	if (completedGameDrift.length > 0) {
		console.log(
			`⚠ Goals drift on COMPLETED games — ${completedGameDrift.length} row(s), NOT written.`,
		)
		console.log('  These goals are the tiebreak behind a pot that has already been paid.')
		for (const d of completedGameDrift) console.log(line(d))
		console.log('')
	}

	if (resultDrift.length > 0) {
		console.log(`⚠ RESULT drift — ${resultDrift.length} row(s), NOT written.`)
		console.log('  The fixture now scores these picks differently. Applying that would')
		console.log('  eliminate or revive a player after the fact — a human decision.')
		for (const d of resultDrift) console.log(line(d))
		console.log('')
	}

	if (goalsDrift.length === 0) {
		console.log('Nothing to apply.')
		return
	}

	if (!APPLY) {
		console.log('Dry run — pass --apply to write the goals drift above.')
		return
	}

	await db.transaction(async (tx) => {
		for (const d of goalsDrift) {
			// Re-read under the transaction: the result must still be what the scan
			// saw, so this can never be the write that changes one.
			const [row] = await tx.select().from(pick).where(eq(pick.id, d.pickId))
			if (!row) throw new Error(`pick ${d.pickId} vanished mid-repair`)
			if (row.result !== d.storedResult) {
				throw new Error(
					`pick ${d.pickId} is now '${row.result}', was '${d.storedResult}' at scan time — aborting`,
				)
			}
		}
		await Promise.all(
			goalsDrift.map((d) =>
				tx.update(pick).set({ goalsScored: d.derivedGoals }).where(eq(pick.id, d.pickId)),
			),
		)
	})
	console.log(`✔ Applied ${goalsDrift.length} goals correction(s).`)

	const written = await db.query.pick.findMany({
		where: inArray(
			pick.id,
			goalsDrift.map((d) => d.pickId),
		),
		columns: { id: true, result: true, goalsScored: true },
	})
	for (const row of written) console.log(`  ${row.id}: ${row.result} goals ${row.goalsScored}`)
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
