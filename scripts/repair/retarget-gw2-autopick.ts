/**
 * Follow-up to `fix-gw2-missed-picks.ts`, in the same PR.
 *
 * That repair ran while auto-pick still measured "worst" by league position, and
 * assigned Aston Villa. The rule now reads the market first (`pickWorstUnusedTeam`),
 * and on this round the two disagree: Ipswich are the round's longest odds at
 * 13.6% while sitting 7th on one game played, which is precisely the early-season
 * case the change exists for. The pick is still pending and its fixture has not
 * kicked off, so it is retargeted to what the current rule chooses.
 *
 * The row is **updated in place, never deleted** — a pick row is a historical
 * event, and this one's identity and `created_at` are the record of when the lock
 * fired. Only what it points at moves.
 *
 * The team is not hand-written either: it comes from the real `pickWorstUnusedTeam`
 * over the same inputs the lock builds, with the used-team set taken as it stood
 * *before* this pick existed.
 *
 * Idempotent — re-running once the row already points at the rule's choice is a
 * no-op. Dry-run by default; pass --apply to write.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { pickWorstUnusedTeam } from '../../src/lib/game/auto-pick'
import { fixture, fixtureOdds, round, team } from '../../src/lib/schema/competition'
import { game, gamePlayer, pick } from '../../src/lib/schema/game'

const GAME_ID = 'ea6f9907-2f79-4061-b7ce-eaf2d1078f6c'
const PLAYER_ID = '9567be2b-2e0b-49fb-a881-2e3753f7fa4e'

const APPLY = process.argv.includes('--apply')

async function main() {
	const g = (await db.select().from(game).where(eq(game.id, GAME_ID)))[0]
	if (!g?.currentRoundId) throw new Error('game or current round not found')
	const r = (await db.select().from(round).where(eq(round.id, g.currentRoundId)))[0]
	const player = (await db.select().from(gamePlayer).where(eq(gamePlayer.id, PLAYER_ID)))[0]
	if (!player || player.gameId !== GAME_ID) throw new Error('player not in this game')

	const fixtures = await db.select().from(fixture).where(eq(fixture.roundId, r.id))
	const odds = await db
		.select()
		.from(fixtureOdds)
		.where(
			inArray(
				fixtureOdds.fixtureId,
				fixtures.map((f) => f.id),
			),
		)
	const teamIds = [...new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))]
	const teams = await db.select().from(team).where(inArray(team.id, teamIds))
	const name = (id: string | null) => teams.find((t) => t.id === id)?.shortName ?? String(id)

	const picks = await db.select().from(pick).where(eq(pick.gamePlayerId, PLAYER_ID))
	const current = picks.find((p) => p.roundId === r.id)
	if (!current) throw new Error('no pick on this round — run fix-gw2-missed-picks.ts first')
	if (!current.isAuto)
		throw new Error('pick is not an auto-pick — refusing to touch a hand-made pick')

	const target = fixtures.find((f) => f.id === current.fixtureId)
	if (target && target.status !== 'scheduled') {
		throw new Error(`current pick's fixture is ${target.status} — too late to retarget`)
	}

	const probabilities = new Map<string, number>()
	for (const f of fixtures) {
		const o = odds.find((x) => x.fixtureId === f.id)
		if (!o) continue
		probabilities.set(f.homeTeamId, o.homeProbability)
		probabilities.set(f.awayTeamId, o.awayProbability)
	}

	// The used set as it stood before this round's pick was written.
	const usedTeamIds = new Set(
		picks.filter((p) => p.roundId !== r.id).flatMap((p) => (p.teamId ? [p.teamId] : [])),
	)
	const chosen = pickWorstUnusedTeam({
		fixtures: fixtures.map((f) => ({
			id: f.id,
			homeTeamId: f.homeTeamId,
			awayTeamId: f.awayTeamId,
		})),
		usedTeamIds,
		teamPositions: new Map(
			teams.map((t) => [t.id, t.leaguePosition ?? Number.POSITIVE_INFINITY] as const),
		),
		teamWinProbabilities: probabilities,
	})
	if (!chosen) throw new Error('the rule returned no team')

	const chosenFixture = fixtures.find((f) => f.homeTeamId === chosen || f.awayTeamId === chosen)
	if (!chosenFixture) throw new Error('chosen team has no fixture in this round')
	if (chosenFixture.status !== 'scheduled') {
		throw new Error(`chosen team's fixture is ${chosenFixture.status} — already under way`)
	}

	console.log(
		`round #${r.number} ${r.name}, used before this pick: ${[...usedTeamIds].map(name).join(', ')}`,
	)
	console.log(`  current : ${name(current.teamId)} (${current.result}, isAuto=${current.isAuto})`)
	console.log(
		`  rule now: ${name(chosen)} at ${((probabilities.get(chosen) ?? 0) * 100).toFixed(1)}%`,
	)
	if (chosen === current.teamId) {
		console.log('\nalready on the rule’s choice — nothing to do')
		process.exit(0)
	}
	console.log(APPLY ? '\nMODE: APPLY' : '\nMODE: DRY RUN (pass --apply to write)')

	if (APPLY) {
		await db
			.update(pick)
			.set({
				teamId: chosen,
				fixtureId: chosenFixture.id,
				predictedResult: chosenFixture.homeTeamId === chosen ? 'home_win' : 'away_win',
			})
			.where(eq(pick.id, current.id))
		const after = (await db.select().from(pick).where(eq(pick.id, current.id)))[0]
		console.log(
			`  pick ${after.id} now ${name(after.teamId)} / ${after.predictedResult} / ${after.result}`,
		)
	}
	process.exit(0)
}
main()
