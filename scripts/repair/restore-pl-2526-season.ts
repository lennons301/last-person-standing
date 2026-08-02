/**
 * One-off prod repair: restore the overwritten 2025/26 PL season from
 * football-data's archive, then archive the competition.
 * Issue #121 / parent #112.
 *
 * Background: until the season-scoped sync landed (#124), the nightly sync
 * matched fixtures on a globally-unique external id. FPL's fixture ids
 * restart every season, so when FPL flipped to 2026/27 the sync rewrote all
 * 380 of last season's fixture rows in place — 2026/27 kickoffs, wiped
 * scores, colliding FPL ids — while keeping the 2025/26 team pairings.
 *
 * What it does (all-or-nothing, single transaction):
 *   1. Fetches the completed 2025/26 season (football-data `?season=2025`,
 *      380 finished matches) and matches each archive match to our fixture
 *      row by (home, away) team pair — each PL pairing happens exactly once
 *      per season, so the pairing is a unique key. Teams resolve through
 *      `team.external_ids.football_data` (stable across seasons, unlike FPL
 *      ids).
 *   2. Restores every fixture's true kickoff, score, status ('finished'),
 *      winner, and 2025/26 football-data id. The colliding FPL ids
 *      (`external_id` and `external_ids.fpl`) are cleared, not
 *      reconstructed — FPL doesn't serve past seasons.
 *   3. Restores the 38 round deadlines as earliest restored kickoff in the
 *      round − 90 minutes — FPL's own deadline convention, and the same
 *      derivation the football-data adapter uses. (FPL doesn't serve past
 *      seasons, so the original event deadlines can't be re-fetched; this
 *      is the documented reconstruction.)
 *   4. Archives the competition so no sync/reconcile/poll surface can ever
 *      touch it again. This script is the sanctioned, sign-off-gated
 *      exception to archived-competition immutability: it exists to make
 *      the archived history truthful before sealing it.
 *
 * Matching is structural (team pairs via stable football-data team ids) —
 * never by round number or kickoff, both of which are corrupted. Every
 * expectation about the current state is asserted before anything is
 * printed as an intended mutation; any drift aborts loudly with no writes.
 *
 * Single-use: after apply, no fixture carries an FPL id, and the
 * ≥1-FPL-id precondition can never pass again.
 *
 * Usage (prod):
 *   dry run: doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/restore-pl-2526-season.ts
 *   apply:   doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/restore-pl-2526-season.ts --apply
 */

import { and, asc, eq, inArray } from 'drizzle-orm'
import { fetchJson } from '../../src/lib/data/fetch-json'
import { db } from '../../src/lib/db'
import { competition, fixture, round, team } from '../../src/lib/schema/competition'
import {
	fail,
	heading,
	PL_2526_EXPECTED_FIXTURES,
	PL_2526_EXPECTED_ROUNDS,
	PL_2526_EXPECTED_TEAMS,
	PL_2526_FD_SEASON,
	PL_2526_KICKOFF_MAX,
	PL_2526_KICKOFF_MIN,
	PL_2526_SEASON,
} from './shared'

const FD_BASE_URL = 'https://api.football-data.org/v4'

// The ticket's named spot-check: the 2025/26 opener, Liverpool 4-2
// Bournemouth on 2025-08-15. Guards against fetching the wrong season.
const OPENER = { homeTla: 'LIV', awayTla: 'BOU', home: 4, away: 2, date: '2025-08-15' }

interface FdArchiveTeam {
	id: number | null
	name: string | null
	tla: string | null
}

interface FdArchiveMatch {
	id: number
	matchday: number | null
	utcDate: string
	status: string
	homeTeam: FdArchiveTeam
	awayTeam: FdArchiveTeam
	score: {
		winner?: string | null
		fullTime: { home: number | null; away: number | null }
		regularTime?: { home: number | null; away: number | null }
	}
}

/** Same semantics as the football-data adapter: DRAW/null → null. */
function mapWinner(winner: string | null | undefined): 'home' | 'away' | null {
	if (winner === 'HOME_TEAM') return 'home'
	if (winner === 'AWAY_TEAM') return 'away'
	return null
}

function fmt(d: Date | null): string {
	return d ? d.toISOString() : '—'
}

function fdId(ids: Record<string, string | number> | null): string | number | null {
	return ids?.football_data ?? null
}

function fplId(ids: Record<string, string | number> | null): string | number | null {
	return ids?.fpl ?? null
}

async function main() {
	const apply = process.argv.includes('--apply')

	heading(`Restore PL ${PL_2526_SEASON} from football-data — ${apply ? 'APPLY' : 'DRY RUN'}`)

	// ── The competition ───────────────────────────────────────────────────
	const comps = await db
		.select()
		.from(competition)
		.where(and(eq(competition.dataSource, 'fpl'), eq(competition.season, PL_2526_SEASON)))
	if (comps.length !== 1) {
		fail(`expected exactly 1 fpl competition with season ${PL_2526_SEASON}, found ${comps.length}`)
	}
	const comp = comps[0]
	if (!comp.name.startsWith('Premier League')) {
		fail(`competition ${comp.id} is named ${JSON.stringify(comp.name)}, expected a Premier League`)
	}
	console.log(`competition: ${JSON.stringify(comp.name)} (${comp.id}) status=${comp.status}`)

	// ── Rounds ────────────────────────────────────────────────────────────
	const rounds = await db
		.select()
		.from(round)
		.where(eq(round.competitionId, comp.id))
		.orderBy(asc(round.number))
	if (rounds.length !== PL_2526_EXPECTED_ROUNDS) {
		fail(`expected ${PL_2526_EXPECTED_ROUNDS} rounds, found ${rounds.length}`)
	}
	rounds.forEach((r, i) => {
		if (r.number !== i + 1) fail(`round numbers are not exactly 1..38 (index ${i} is R${r.number})`)
	})

	// ── Fixtures ──────────────────────────────────────────────────────────
	const fixtures = await db
		.select()
		.from(fixture)
		.where(
			inArray(
				fixture.roundId,
				rounds.map((r) => r.id),
			),
		)
	if (fixtures.length !== PL_2526_EXPECTED_FIXTURES) {
		fail(`expected ${PL_2526_EXPECTED_FIXTURES} fixtures, found ${fixtures.length}`)
	}

	// Single-use guard: the restore clears every FPL id, so a re-run can
	// never see one. (The corrupting sync rewrote external_ids.fpl on every
	// row; external_id has held an FPL id since the original bootstrap.)
	const withFplId = fixtures.filter((f) => f.externalId != null || fplId(f.externalIds) != null)
	if (withFplId.length === 0) {
		fail('no fixture carries an FPL id — the restore appears to have already been applied')
	}

	// Current-state census — the corruption evidence the dry run documents.
	const inWindow = (d: Date | null) =>
		d != null && d >= PL_2526_KICKOFF_MIN && d <= PL_2526_KICKOFF_MAX
	const statusCounts = new Map<string, number>()
	for (const f of fixtures) statusCounts.set(f.status, (statusCounts.get(f.status) ?? 0) + 1)
	console.log(`\nCurrent state (${fixtures.length} fixtures):`)
	console.log(`  status: ${[...statusCounts].map(([s, n]) => `${s}=${n}`).join(' ')}`)
	console.log(
		`  kickoff in ${PL_2526_SEASON} window: ${fixtures.filter((f) => inWindow(f.kickoff)).length}` +
			` | outside: ${fixtures.filter((f) => f.kickoff != null && !inWindow(f.kickoff)).length}` +
			` | null: ${fixtures.filter((f) => f.kickoff == null).length}`,
	)
	console.log(`  missing scores: ${fixtures.filter((f) => f.homeScore == null).length}`)
	console.log(
		`  carrying an FPL id: ${withFplId.length}` +
			` | carrying a football-data id: ${fixtures.filter((f) => fdId(f.externalIds) != null).length}`,
	)

	// ── The archive ───────────────────────────────────────────────────────
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	if (!apiKey) fail('FOOTBALL_DATA_API_KEY is not set')
	const archiveUrl = `${FD_BASE_URL}/competitions/PL/matches?season=${PL_2526_FD_SEASON}`
	console.log(`\nFetching ${archiveUrl} …`)
	const { matches } = await fetchJson<{ matches: FdArchiveMatch[] }>(archiveUrl, {
		headers: { 'X-Auth-Token': apiKey },
	})
	if (matches.length !== PL_2526_EXPECTED_FIXTURES) {
		fail(`archive returned ${matches.length} matches, expected ${PL_2526_EXPECTED_FIXTURES}`)
	}
	for (const m of matches) {
		if (m.status !== 'FINISHED')
			fail(`archive match ${m.id} has status ${m.status}, expected FINISHED`)
		if (m.score.fullTime.home == null || m.score.fullTime.away == null) {
			fail(`archive match ${m.id} has no full-time score`)
		}
		if (m.homeTeam.id == null || m.awayTeam.id == null) {
			fail(`archive match ${m.id} has unresolved teams`)
		}
		const kickoff = new Date(m.utcDate)
		if (Number.isNaN(kickoff.getTime()) || !inWindow(kickoff)) {
			fail(
				`archive match ${m.id} kicks off at ${m.utcDate}, outside the ${PL_2526_SEASON} window — wrong season?`,
			)
		}
	}
	const opener = matches.find(
		(m) => m.homeTeam.tla === OPENER.homeTla && m.awayTeam.tla === OPENER.awayTla,
	)
	if (!opener) fail(`archive has no ${OPENER.homeTla} v ${OPENER.awayTla} match`)
	if (
		opener.score.fullTime.home !== OPENER.home ||
		opener.score.fullTime.away !== OPENER.away ||
		!opener.utcDate.startsWith(OPENER.date)
	) {
		fail(
			`spot-check failed: ${OPENER.homeTla} v ${OPENER.awayTla} is ${opener.score.fullTime.home}-${opener.score.fullTime.away} on ${opener.utcDate}, expected ${OPENER.home}-${OPENER.away} on ${OPENER.date}`,
		)
	}
	console.log(
		`archive OK: ${matches.length} finished matches; opener ${OPENER.homeTla} ${OPENER.home}-${OPENER.away} ${OPENER.awayTla} on ${OPENER.date} ✓`,
	)

	// ── Team resolution: football-data id → our team row ─────────────────
	// football-data team ids are globally stable across seasons (unlike FPL
	// ids), and every 2025/26 team row got its football-data id merged while
	// the season was live.
	const archiveTeams = new Map<number, FdArchiveTeam>()
	for (const m of matches) {
		for (const t of [m.homeTeam, m.awayTeam]) {
			if (t.id != null) archiveTeams.set(t.id, t)
		}
	}
	if (archiveTeams.size !== PL_2526_EXPECTED_TEAMS) {
		fail(`archive names ${archiveTeams.size} teams, expected ${PL_2526_EXPECTED_TEAMS}`)
	}
	const allTeams = await db.select().from(team)
	const teamUuidByFdId = new Map<number, string>()
	for (const [id, t] of archiveTeams) {
		const ours = allTeams.filter((row) => String(fdId(row.externalIds)) === String(id))
		if (ours.length !== 1) {
			fail(
				`archive team ${t.name} (fd id ${id}) resolves to ${ours.length} team rows, expected exactly 1`,
			)
		}
		teamUuidByFdId.set(id, ours[0].id)
	}
	// The pairings on our fixture rows were never corrupted — the resolved
	// archive teams must be exactly the teams our fixtures reference.
	const fixtureTeamIds = new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
	const resolvedTeamIds = new Set(teamUuidByFdId.values())
	if (
		fixtureTeamIds.size !== resolvedTeamIds.size ||
		[...fixtureTeamIds].some((id) => !resolvedTeamIds.has(id))
	) {
		fail(
			`teams referenced by our fixtures (${fixtureTeamIds.size}) do not match the archive's resolved teams (${resolvedTeamIds.size})`,
		)
	}
	const teamById = new Map(allTeams.map((t) => [t.id, t]))
	const shortName = (teamId: string) => teamById.get(teamId)?.shortName ?? teamId.slice(0, 8)

	// ── Fixture matching by team pair (bijection) ─────────────────────────
	const fixtureByPair = new Map<string, (typeof fixtures)[number]>()
	for (const f of fixtures) {
		const key = `${f.homeTeamId}|${f.awayTeamId}`
		if (fixtureByPair.has(key)) {
			fail(
				`duplicate fixture rows for pairing ${shortName(f.homeTeamId)} v ${shortName(f.awayTeamId)}`,
			)
		}
		fixtureByPair.set(key, f)
	}
	const matchByFixtureId = new Map<string, FdArchiveMatch>()
	for (const m of matches) {
		const home = teamUuidByFdId.get(m.homeTeam.id as number) as string
		const away = teamUuidByFdId.get(m.awayTeam.id as number) as string
		const ours = fixtureByPair.get(`${home}|${away}`)
		if (!ours) {
			fail(`no fixture row for archive match ${m.id} (${m.homeTeam.tla} v ${m.awayTeam.tla})`)
		}
		if (matchByFixtureId.has(ours.id)) {
			fail(
				`two archive matches resolve to fixture ${ours.id} (${m.homeTeam.tla} v ${m.awayTeam.tla})`,
			)
		}
		matchByFixtureId.set(ours.id, m)
	}
	if (matchByFixtureId.size !== fixtures.length) {
		fail(`matched ${matchByFixtureId.size}/${fixtures.length} fixtures — bijection broken`)
	}

	// ── Restored round deadlines ──────────────────────────────────────────
	// Earliest restored kickoff in the round − 90 minutes (FPL's deadline
	// convention; same derivation as the football-data adapter). Grouped by
	// OUR round rows — the FPL gameweek grouping the picks were made against
	// — not football-data's matchday, which can differ after reschedules.
	const deadlineByRoundId = new Map<string, Date>()
	for (const f of fixtures) {
		const kickoff = new Date((matchByFixtureId.get(f.id) as FdArchiveMatch).utcDate)
		const current = deadlineByRoundId.get(f.roundId)
		if (!current || kickoff.getTime() < current.getTime()) {
			deadlineByRoundId.set(f.roundId, kickoff)
		}
	}
	for (const r of rounds) {
		const earliest = deadlineByRoundId.get(r.id)
		if (!earliest) fail(`round R${r.number} ${JSON.stringify(r.name)} has no fixtures`)
		deadlineByRoundId.set(r.id, new Date(earliest.getTime() - 90 * 60 * 1000))
	}

	// ── Intended mutations ────────────────────────────────────────────────
	heading('Intended mutations')
	const fixturesByRoundId = new Map<string, (typeof fixtures)[number][]>()
	for (const f of fixtures) {
		const bucket = fixturesByRoundId.get(f.roundId) ?? []
		bucket.push(f)
		fixturesByRoundId.set(f.roundId, bucket)
	}
	for (const r of rounds) {
		const newDeadline = deadlineByRoundId.get(r.id) as Date
		console.log(`\nR${r.number} ${r.name}: deadline ${fmt(r.deadline)} → ${fmt(newDeadline)}`)
		const bucket = (fixturesByRoundId.get(r.id) ?? []).sort(
			(a, b) =>
				new Date((matchByFixtureId.get(a.id) as FdArchiveMatch).utcDate).getTime() -
				new Date((matchByFixtureId.get(b.id) as FdArchiveMatch).utcDate).getTime(),
		)
		for (const f of bucket) {
			const m = matchByFixtureId.get(f.id) as FdArchiveMatch
			const oldScore = f.homeScore != null ? `${f.homeScore}-${f.awayScore}` : '—'
			console.log(
				`  ${shortName(f.homeTeamId)} v ${shortName(f.awayTeamId)}: ` +
					`kickoff ${fmt(f.kickoff)} → ${m.utcDate}, ` +
					`${f.status} ${oldScore} → finished ${m.score.fullTime.home}-${m.score.fullTime.away}` +
					`${mapWinner(m.score.winner) ? ` (winner=${mapWinner(m.score.winner)})` : ''}, ` +
					`fpl id ${f.externalId ?? fplId(f.externalIds) ?? '—'} → cleared, ` +
					`fd id ${fdId(f.externalIds) ?? '—'} → ${m.id}`,
			)
		}
	}
	console.log(
		`\nCompetition ${JSON.stringify(comp.name)}: status ${comp.status} → archived` +
			(comp.status === 'archived' ? ' (already archived — no-op)' : ''),
	)

	if (!apply) {
		console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.')
		process.exit(0)
	}

	// ── Apply ─────────────────────────────────────────────────────────────
	await db.transaction(async (tx) => {
		for (const f of fixtures) {
			const m = matchByFixtureId.get(f.id) as FdArchiveMatch
			await tx
				.update(fixture)
				.set({
					kickoff: new Date(m.utcDate),
					status: 'finished',
					homeScore: m.score.fullTime.home,
					awayScore: m.score.fullTime.away,
					regularHomeScore: m.score.regularTime?.home ?? null,
					regularAwayScore: m.score.regularTime?.away ?? null,
					winner: mapWinner(m.score.winner),
					externalId: null,
					externalIds: { football_data: String(m.id) },
				})
				.where(eq(fixture.id, f.id))
		}
		for (const r of rounds) {
			await tx
				.update(round)
				.set({ deadline: deadlineByRoundId.get(r.id) as Date })
				.where(eq(round.id, r.id))
		}
		await tx.update(competition).set({ status: 'archived' }).where(eq(competition.id, comp.id))
	})

	// ── Post-apply verification ───────────────────────────────────────────
	heading('Applied — post-state')
	const compAfter = await db.query.competition.findFirst({ where: eq(competition.id, comp.id) })
	const fixturesAfter = await db
		.select()
		.from(fixture)
		.where(
			inArray(
				fixture.roundId,
				rounds.map((r) => r.id),
			),
		)
	console.log(`competition status: ${compAfter?.status} (expect archived)`)
	console.log(
		`fixtures finished with scores: ${fixturesAfter.filter((f) => f.status === 'finished' && f.homeScore != null).length}/${fixturesAfter.length} (expect ${PL_2526_EXPECTED_FIXTURES})`,
	)
	console.log(
		`kickoffs in ${PL_2526_SEASON} window: ${fixturesAfter.filter((f) => inWindow(f.kickoff)).length}/${fixturesAfter.length} (expect ${PL_2526_EXPECTED_FIXTURES})`,
	)
	console.log(
		`carrying an FPL id: ${fixturesAfter.filter((f) => f.externalId != null || fplId(f.externalIds) != null).length} (expect 0)`,
	)
	console.log(
		`carrying a football-data id: ${fixturesAfter.filter((f) => fdId(f.externalIds) != null).length} (expect ${PL_2526_EXPECTED_FIXTURES})`,
	)
	console.log('\nRun scripts/repair/inspect-pl-2526-restore.ts for the full restored record.')
	process.exit(0)
}

main().catch((err) => {
	console.error('Restore failed:', err)
	process.exit(1)
})
