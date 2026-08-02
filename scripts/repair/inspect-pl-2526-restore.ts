/**
 * Read-only inspector for the 2025/26 PL season restore (issue #121).
 *
 * Prints the competition's status, per-round deadlines + fixture census,
 * the full GW1 and GW38 fixture lists (the ticket's spot-check surfaces),
 * and every game on the competition with its picks joined to their
 * fixtures' scores — the "Last Day Lightning 26" truthfulness evidence.
 * SELECT-only — safe to run against prod at any time, before or after the
 * restore.
 *
 * Usage (prod):
 *   doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-2526-restore.ts
 */

import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { user } from '../../src/lib/schema/auth'
import { competition, fixture, round, team } from '../../src/lib/schema/competition'
import { game, gamePlayer, pick } from '../../src/lib/schema/game'
import { fixtureCensusLines, heading, PL_2526_SEASON } from './shared'

type FixtureRow = typeof fixture.$inferSelect

function fmt(d: Date | null): string {
	return d ? d.toISOString() : '—'
}

function score(f: FixtureRow): string {
	return f.homeScore != null ? `${f.homeScore}-${f.awayScore}` : '—'
}

async function main() {
	heading(`Premier League ${PL_2526_SEASON} — restore inspector`)

	const comps = await db
		.select()
		.from(competition)
		.where(and(eq(competition.dataSource, 'fpl'), eq(competition.season, PL_2526_SEASON)))
	if (comps.length !== 1) {
		console.log(
			`Found ${comps.length} fpl competitions with season ${PL_2526_SEASON} — nothing to inspect.`,
		)
		process.exit(0)
	}
	const comp = comps[0]
	console.log(`name=${JSON.stringify(comp.name)} id=${comp.id} status=${comp.status}`)

	const rounds = await db
		.select()
		.from(round)
		.where(eq(round.competitionId, comp.id))
		.orderBy(asc(round.number))
	const fixtures = await db
		.select()
		.from(fixture)
		.where(
			inArray(
				fixture.roundId,
				rounds.map((r) => r.id),
			),
		)
	const teams = await db.select().from(team)
	const teamById = new Map(teams.map((t) => [t.id, t]))
	const shortName = (teamId: string) => teamById.get(teamId)?.shortName ?? teamId.slice(0, 8)
	const fixturesByRoundId = new Map<string, FixtureRow[]>()
	for (const f of fixtures) {
		const bucket = fixturesByRoundId.get(f.roundId) ?? []
		bucket.push(f)
		fixturesByRoundId.set(f.roundId, bucket)
	}

	// ── Fixture census ────────────────────────────────────────────────────
	const extIds = (f: FixtureRow) => f.externalIds as Record<string, string | number> | null
	console.log(`\nFixture census (${fixtures.length} fixtures, ${rounds.length} rounds):`)
	for (const line of fixtureCensusLines(fixtures)) console.log(`  ${line}`)

	// ── Rounds ────────────────────────────────────────────────────────────
	console.log('\nRounds:')
	for (const r of rounds) {
		const bucket = fixturesByRoundId.get(r.id) ?? []
		const kickoffs = bucket
			.map((f) => f.kickoff)
			.filter((k): k is Date => k != null)
			.sort((a, b) => a.getTime() - b.getTime())
		console.log(
			`  R${String(r.number).padStart(2)} ${r.name}: status=${r.status} deadline=${fmt(r.deadline)}` +
				` fixtures=${bucket.length} kickoffs=${fmt(kickoffs[0] ?? null)} … ${fmt(kickoffs[kickoffs.length - 1] ?? null)}`,
		)
	}

	// ── GW1 + GW38 listings (the ticket's spot-check surfaces) ────────────
	for (const number of [1, rounds.length]) {
		const r = rounds.find((row) => row.number === number)
		if (!r) continue
		console.log(`\nR${r.number} ${r.name} fixtures:`)
		const bucket = (fixturesByRoundId.get(r.id) ?? []).sort(
			(a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0),
		)
		for (const f of bucket) {
			console.log(
				`  ${shortName(f.homeTeamId)} ${score(f)} ${shortName(f.awayTeamId)}` +
					` kickoff=${fmt(f.kickoff)} status=${f.status}` +
					`${f.winner ? ` winner=${f.winner}` : ''}` +
					` fplId=${f.externalId ?? extIds(f)?.fpl ?? '—'} fdId=${extIds(f)?.football_data ?? '—'}`,
			)
		}
	}

	// ── Games on the competition ──────────────────────────────────────────
	const games = await db.select().from(game).where(eq(game.competitionId, comp.id))
	const roundById = new Map(rounds.map((r) => [r.id, r]))
	const fixtureById = new Map(fixtures.map((f) => [f.id, f]))
	console.log(`\nGames on this competition (${games.length}):`)
	for (const g of games) {
		heading(`${g.name} — mode=${g.gameMode} status=${g.status}`)
		const players = await db.select().from(gamePlayer).where(eq(gamePlayer.gameId, g.id))
		const names = new Map(
			players.length > 0
				? (
						await db
							.select({ id: user.id, name: user.name })
							.from(user)
							.where(
								inArray(
									user.id,
									players.map((p) => p.userId),
								),
							)
					).map((u) => [u.id, u.name])
				: [],
		)
		const playerById = new Map(players.map((p) => [p.id, p]))
		const picks = await db.select().from(pick).where(eq(pick.gameId, g.id))
		picks.sort(
			(a, b) => (roundById.get(a.roundId)?.number ?? 0) - (roundById.get(b.roundId)?.number ?? 0),
		)
		console.log(`players=${players.length} picks=${picks.length}`)
		for (const p of picks) {
			const who = playerById.get(p.gamePlayerId)
			const name = who ? (names.get(who.userId) ?? who.userId) : p.gamePlayerId
			const r = roundById.get(p.roundId)
			const f = p.fixtureId ? fixtureById.get(p.fixtureId) : undefined
			console.log(
				`  R${r?.number ?? '?'} ${name}: ${shortName(p.teamId)} → ${p.result}` +
					(f
						? ` (fixture ${shortName(f.homeTeamId)} ${score(f)} ${shortName(f.awayTeamId)}, kickoff=${fmt(f.kickoff)}, status=${f.status})`
						: ' (no fixture linked)'),
			)
		}
	}

	console.log()
	process.exit(0)
}

main().catch((err) => {
	console.error('Inspect failed:', err)
	process.exit(1)
})
