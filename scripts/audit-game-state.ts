/**
 * One-off audit script for live-game state issues introduced by missing
 * auto-completion / turbo-rollover bugs (PRs #23–#26).
 *
 * Surfaces:
 *  1. Orphaned games (status='active', currentRoundId=null) — game has
 *     no round to play but was never marked completed.
 *  2. Turbo games on round 2+ — turbo is single-round; any game with a
 *     currentRoundId pointing at round.number > 1 has rolled over.
 *  3. Games that should auto-complete (status='active' with exactly 1
 *     alive player remaining) — auto-completion didn't fire pre-fix.
 *  4. Games stuck on a completed round (currentRoundId points at a
 *     round.status='completed' record) — the advance never happened
 *     or was a no-op because the next round was TBD.
 *
 * Run against any environment with:
 *   pnpm doppler run -p lps -c prd -- pnpm tsx scripts/audit-game-state.ts
 *
 * Read-only: prints a report; does not mutate.
 */
import { db } from '../src/lib/db'

interface GameReport {
	id: string
	name: string
	mode: string
	status: string
	currentRoundId: string | null
	currentRoundNumber: number | null
	currentRoundStatus: string | null
	aliveCount: number
	totalPlayers: number
}

async function loadReports(): Promise<GameReport[]> {
	const games = await db.query.game.findMany({
		with: {
			currentRound: true,
			players: true,
		},
	})
	return games.map((g) => {
		const alive = g.players.filter((p) => p.status === 'alive')
		return {
			id: g.id,
			name: g.name,
			mode: g.gameMode,
			status: g.status,
			currentRoundId: g.currentRoundId,
			currentRoundNumber: g.currentRound?.number ?? null,
			currentRoundStatus: g.currentRound?.status ?? null,
			aliveCount: alive.length,
			totalPlayers: g.players.length,
		}
	})
}

function printSection(title: string, rows: GameReport[]) {
	console.log(`\n=== ${title} (${rows.length}) ===`)
	if (rows.length === 0) {
		console.log('  none')
		return
	}
	for (const r of rows) {
		console.log(
			`  [${r.id.slice(0, 8)}] ${r.name} (${r.mode}, status=${r.status}) ` +
				`round=${r.currentRoundNumber ?? '∅'}/${r.currentRoundStatus ?? '∅'} ` +
				`alive=${r.aliveCount}/${r.totalPlayers}`,
		)
	}
}

async function main() {
	const reports = await loadReports()

	const orphaned = reports.filter((r) => r.status === 'active' && r.currentRoundId == null)
	const turboRolledOver = reports.filter(
		(r) =>
			r.mode === 'turbo' &&
			r.status === 'active' &&
			r.currentRoundNumber != null &&
			r.currentRoundNumber > 1,
	)
	const shouldAutoComplete = reports.filter((r) => r.status === 'active' && r.aliveCount === 1)
	const stuckOnCompleted = reports.filter(
		(r) => r.status === 'active' && r.currentRoundStatus === 'completed',
	)

	console.log(`Audit run at ${new Date().toISOString()}`)
	console.log(`Total games inspected: ${reports.length}`)
	printSection('Orphaned (active + no current round)', orphaned)
	printSection('Turbo rolled over (round.number > 1)', turboRolledOver)
	printSection('Should auto-complete (active + 1 alive)', shouldAutoComplete)
	printSection('Stuck on completed round (advance no-op)', stuckOnCompleted)

	const allFlagged = new Set([
		...orphaned.map((r) => r.id),
		...turboRolledOver.map((r) => r.id),
		...shouldAutoComplete.map((r) => r.id),
		...stuckOnCompleted.map((r) => r.id),
	])
	console.log(`\nDistinct games flagged: ${allFlagged.size}`)
	process.exit(0)
}

main().catch((err) => {
	console.error('Audit failed:', err)
	process.exit(1)
})
