/**
 * Read-only GW1-readiness inspector for the automatic PL season rollover
 * (issue #122; season-agnostic, so it doubles as the annual verification
 * tool — see AGENTS.md "PL season rollover").
 *
 * Derives the expected season from the live sources through the exact code
 * path the deployed rollover uses (football-data currentSeason cross-checked
 * against FPL's GW1 deadline), then verifies:
 *
 *   1. Sources — season detection succeeds; every FPL team tla-matches a
 *      football-data team (predicts mergeFootballDataIds coverage); GW1
 *      pairings agree between the two sources; every fd team has a crest.
 *   2. DB — the detected season's competition exists, is active, and carries
 *      38 rounds / 380 fixtures / 20 teams; its GW1 pairings match the
 *      sources; GW1 is pickable for a new classic game (future deadline);
 *      every team carries both external ids, a badge, and a colour entry.
 *   3. DB — every predecessor fpl competition is archived and untouched
 *      (no fixture carries an FPL id; no kickoff strays into the new season).
 *
 * Before the rollover has run, section 1 still executes as a pre-flight and
 * the current-season DB section reports the baseline instead of failing.
 * SELECT-only — safe to run against prod at any time.
 *
 * Usage (prod):
 *   doppler run -p last-person-standing -c prd -- pnpm exec tsx scripts/repair/inspect-pl-rollover.ts
 */

import { asc, eq, inArray } from 'drizzle-orm'
import { FootballDataAdapter } from '../../src/lib/data/football-data'
import { FplAdapter } from '../../src/lib/data/fpl'
import { db } from '../../src/lib/db'
import { deriveSeasonLabel, fdTlaForFplShortName } from '../../src/lib/game/bootstrap-competitions'
import { competition, fixture, round, team } from '../../src/lib/schema/competition'
import { FALLBACK_TEAM_COLOUR, getTeamColour } from '../../src/lib/teams/colours'
import { heading } from './shared'

const PL_EXPECTED_ROUNDS = 38
const PL_EXPECTED_FIXTURES = 380
const PL_EXPECTED_TEAMS = 20
const PICKABLE_ROUND_STATUSES = ['upcoming', 'open', 'active']

const failures: string[] = []

function check(ok: boolean, label: string): void {
	console.log(`  ${ok ? '✔' : '✖'} ${label}`)
	if (!ok) failures.push(label)
}

function fmt(d: Date | null | undefined): string {
	return d ? d.toISOString() : '—'
}

/** Order-insensitive pairing key in football-data tla space. */
function pairKey(homeTla: string, awayTla: string): string {
	return `${homeTla} v ${awayTla}`
}

function diffPairs(label: string, ours: Set<string>, theirs: Set<string>): void {
	const missing = [...theirs].filter((p) => !ours.has(p))
	const extra = [...ours].filter((p) => !theirs.has(p))
	if (missing.length > 0) console.log(`    ${label} missing: ${missing.join(', ')}`)
	if (extra.length > 0) console.log(`    ${label} extra: ${extra.join(', ')}`)
}

async function main() {
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	if (!apiKey) {
		console.error('FOOTBALL_DATA_API_KEY is not set — run under doppler (see usage in header).')
		process.exit(1)
	}

	// ── 1. Sources — season detection + GW1 cross-check ──────────────────
	heading('Sources — season detection (the rollover’s own code path)')
	const fpl = new FplAdapter()
	const fd = new FootballDataAdapter('PL', apiKey)
	// Sequential so FplAdapter's bootstrap cache is primed for the later calls.
	const fplGw1Deadline = await fpl.fetchGw1Deadline()
	const fdSeason = await fd.fetchCurrentSeason()
	console.log(
		`  football-data currentSeason: ${fdSeason ? `${fdSeason.startDate} → ${fdSeason.endDate}` : '—'}`,
	)
	console.log(`  FPL GW1 deadline: ${fmt(fplGw1Deadline)}`)
	// Throws SeasonDetectionError on any absence or disagreement — the same
	// loud zero-write abort the deployed rollover takes.
	const season = deriveSeasonLabel(fdSeason, fplGw1Deadline)
	console.log(`  derived season label: ${season}`)
	const now = new Date()
	check(
		fplGw1Deadline != null && fplGw1Deadline > now,
		`GW1 deadline is in the future (${fmt(fplGw1Deadline)})`,
	)

	heading(`Sources — FPL ↔ football-data team + GW1 cross-check for ${season}`)
	const fplTeams = await fpl.fetchTeams()
	const fplRounds = await fpl.fetchRounds()
	const fdTeams = await fd.fetchTeams()
	const fdRounds = await fd.fetchRounds()

	check(
		fplTeams.length === PL_EXPECTED_TEAMS,
		`FPL lists ${PL_EXPECTED_TEAMS} teams (got ${fplTeams.length})`,
	)
	check(
		fdTeams.length === PL_EXPECTED_TEAMS,
		`football-data lists ${PL_EXPECTED_TEAMS} teams (got ${fdTeams.length})`,
	)

	// tla alignment predicts mergeFootballDataIds' loud coverage assertion.
	const fdTlas = new Set(fdTeams.map((t) => t.shortName))
	const tlaUnmatched = fplTeams.filter((t) => !fdTlas.has(fdTlaForFplShortName(t.shortName)))
	check(
		tlaUnmatched.length === 0,
		'every FPL team tla-matches a football-data team (via FPL_TO_FD_TLA)' +
			(tlaUnmatched.length > 0
				? ` — UNMATCHED: ${tlaUnmatched.map((t) => `${t.shortName} (${t.name})`).join(', ')} — add to FPL_TO_FD_TLA`
				: ''),
	)

	const crestless = fdTeams.filter((t) => !t.badgeUrl)
	check(
		crestless.length === 0,
		'every football-data team has a crest URL' +
			(crestless.length > 0 ? ` — missing: ${crestless.map((t) => t.name).join(', ')}` : ''),
	)

	const fplGw1 = fplRounds.find((r) => r.number === 1)
	const fdGw1 = fdRounds.find((r) => r.number === 1)
	const fplShortById = new Map(fplTeams.map((t) => [t.externalId, t.shortName]))
	const fdShortById = new Map(fdTeams.map((t) => [t.externalId, t.shortName]))
	const fplGw1Pairs = new Set(
		(fplGw1?.fixtures ?? []).map((f) =>
			pairKey(
				fdTlaForFplShortName(fplShortById.get(f.homeTeamExternalId) ?? '?'),
				fdTlaForFplShortName(fplShortById.get(f.awayTeamExternalId) ?? '?'),
			),
		),
	)
	const fdGw1Pairs = new Set(
		(fdGw1?.fixtures ?? []).map((f) =>
			pairKey(
				fdShortById.get(f.homeTeamExternalId) ?? '?',
				fdShortById.get(f.awayTeamExternalId) ?? '?',
			),
		),
	)
	console.log(`  GW1 pairings (football-data, by kickoff):`)
	for (const f of [...(fdGw1?.fixtures ?? [])].sort(
		(a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0),
	)) {
		console.log(
			`    ${fdShortById.get(f.homeTeamExternalId)} v ${fdShortById.get(f.awayTeamExternalId)} kickoff=${fmt(f.kickoff)}`,
		)
	}
	check(
		fplGw1Pairs.size === PL_EXPECTED_FIXTURES / PL_EXPECTED_ROUNDS,
		`GW1 has ${PL_EXPECTED_FIXTURES / PL_EXPECTED_ROUNDS} fixtures on FPL (got ${fplGw1Pairs.size})`,
	)
	const sourcesAgree =
		fplGw1Pairs.size === fdGw1Pairs.size && [...fplGw1Pairs].every((p) => fdGw1Pairs.has(p))
	check(sourcesAgree, 'GW1 pairings agree between FPL and football-data')
	if (!sourcesAgree) diffPairs('FPL vs football-data', fplGw1Pairs, fdGw1Pairs)

	// ── 2. DB — the detected season's competition ─────────────────────────
	heading(`Prod DB — "Premier League ${season}"`)
	const fplComps = await db.select().from(competition).where(eq(competition.dataSource, 'fpl'))
	const current = fplComps.find((c) => c.season === season)
	const predecessors = fplComps.filter((c) => c.season !== season)
	const predecessorTlas = new Set<string>()

	if (!current) {
		const active = fplComps.filter((c) => c.status === 'active')
		console.log(
			`  No fpl competition with season ${season} — the rollover has NOT run yet (pre-execution baseline).`,
		)
		console.log(
			`  fpl competitions present: ${fplComps.map((c) => `"${c.name}" (${c.status})`).join(', ') || 'none'}`,
		)
		check(
			active.length === 0,
			'no active fpl competition awaiting archive (predecessors already archived)',
		)
	} else {
		check(current.status === 'active', `competition status is active (got ${current.status})`)
		check(
			current.name === `Premier League ${season}`,
			`competition name is "Premier League ${season}" (got "${current.name}")`,
		)

		const rounds = await db
			.select()
			.from(round)
			.where(eq(round.competitionId, current.id))
			.orderBy(asc(round.number))
		const fixtures =
			rounds.length > 0
				? await db
						.select()
						.from(fixture)
						.where(
							inArray(
								fixture.roundId,
								rounds.map((r) => r.id),
							),
						)
				: []
		check(
			rounds.length === PL_EXPECTED_ROUNDS,
			`${PL_EXPECTED_ROUNDS} rounds (got ${rounds.length})`,
		)
		check(
			fixtures.length === PL_EXPECTED_FIXTURES,
			`${PL_EXPECTED_FIXTURES} fixtures (got ${fixtures.length})`,
		)

		const teamIds = new Set<string>()
		for (const f of fixtures) {
			teamIds.add(f.homeTeamId)
			teamIds.add(f.awayTeamId)
		}
		const teams =
			teamIds.size > 0
				? await db
						.select()
						.from(team)
						.where(inArray(team.id, [...teamIds]))
				: []
		const teamById = new Map(teams.map((t) => [t.id, t]))
		check(
			teams.length === PL_EXPECTED_TEAMS,
			`${PL_EXPECTED_TEAMS} teams on the competition (got ${teams.length})`,
		)

		// GW1: pickable + pairings match both sources.
		const gw1 = rounds.find((r) => r.number === 1)
		const gw1Fixtures = gw1 ? fixtures.filter((f) => f.roundId === gw1.id) : []
		check(
			gw1 != null &&
				PICKABLE_ROUND_STATUSES.includes(gw1.status) &&
				gw1.deadline != null &&
				gw1.deadline > now,
			`GW1 is pickable for a new classic game (status=${gw1?.status ?? '—'}, deadline=${fmt(gw1?.deadline)})`,
		)
		const dbTla = (teamId: string) => {
			const t = teamById.get(teamId)
			return t ? fdTlaForFplShortName(t.shortName) : '?'
		}
		const dbGw1Pairs = new Set(
			gw1Fixtures.map((f) => pairKey(dbTla(f.homeTeamId), dbTla(f.awayTeamId))),
		)
		console.log(`  GW1 fixtures in DB (by kickoff):`)
		for (const f of [...gw1Fixtures].sort(
			(a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0),
		)) {
			const ids = f.externalIds as Record<string, string | number> | null
			console.log(
				`    ${teamById.get(f.homeTeamId)?.shortName} v ${teamById.get(f.awayTeamId)?.shortName}` +
					` kickoff=${fmt(f.kickoff)} status=${f.status} fplId=${ids?.fpl ?? f.externalId ?? '—'} fdId=${ids?.football_data ?? '—'}`,
			)
		}
		const dbAgreesFd =
			dbGw1Pairs.size === fdGw1Pairs.size && [...dbGw1Pairs].every((p) => fdGw1Pairs.has(p))
		check(dbAgreesFd, 'DB GW1 pairings match football-data (and, transitively, FPL)')
		if (!dbAgreesFd) diffPairs('DB vs football-data', dbGw1Pairs, fdGw1Pairs)

		// Team coverage: both external ids, a badge, a colour entry.
		const extIds = (t: (typeof teams)[number]) =>
			t.externalIds as Record<string, string | number> | null
		const missingFpl = teams.filter((t) => extIds(t)?.fpl == null)
		const missingFd = teams.filter((t) => extIds(t)?.football_data == null)
		check(
			missingFpl.length === 0,
			'every team carries an FPL id' +
				(missingFpl.length > 0
					? ` — missing: ${missingFpl.map((t) => t.shortName).join(', ')}`
					: ''),
		)
		check(
			missingFd.length === 0,
			'every team carries a football-data id (live scoring works)' +
				(missingFd.length > 0 ? ` — missing: ${missingFd.map((t) => t.shortName).join(', ')}` : ''),
		)
		const badgeless = teams.filter((t) => !t.badgeUrl)
		check(
			badgeless.length === 0,
			'every team has a badge URL' +
				(badgeless.length > 0 ? ` — missing: ${badgeless.map((t) => t.shortName).join(', ')}` : ''),
		)
		const colourless = teams.filter((t) => getTeamColour(t.shortName) === FALLBACK_TEAM_COLOUR)
		check(
			colourless.length === 0,
			'every team has a TEAM_COLOURS entry (src/lib/teams/colours.ts)' +
				(colourless.length > 0
					? ` — falling back to grey: ${colourless.map((t) => t.shortName).join(', ')}`
					: ''),
		)

		// Promoted clubs (not in any predecessor season's team set): the badge
		// must be a football-data crest — the FPL CDN 404s for them.
		for (const pred of predecessors) {
			const predRounds = await db
				.select({ id: round.id })
				.from(round)
				.where(eq(round.competitionId, pred.id))
			const predFixtures =
				predRounds.length > 0
					? await db
							.select({ homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId })
							.from(fixture)
							.where(
								inArray(
									fixture.roundId,
									predRounds.map((r) => r.id),
								),
							)
					: []
			const predTeamIds = new Set(predFixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
			const predTeams =
				predTeamIds.size > 0
					? await db
							.select()
							.from(team)
							.where(inArray(team.id, [...predTeamIds]))
					: []
			for (const t of predTeams) predecessorTlas.add(t.shortName)
		}
		const promoted = teams.filter((t) => !predecessorTlas.has(t.shortName))
		console.log(
			`  promoted clubs (new vs predecessor seasons): ${promoted.map((t) => t.shortName).join(', ') || '—'}`,
		)
		for (const t of promoted) {
			console.log(
				`    ${t.shortName} ${t.name}: badge=${t.badgeUrl ?? '—'} colour=${getTeamColour(t.shortName)}`,
			)
		}
	}

	// ── 3. DB — predecessors archived + untouched ─────────────────────────
	heading('Prod DB — predecessor fpl seasons archived + untouched')
	if (predecessors.length === 0) console.log('  (none)')
	for (const pred of predecessors) {
		console.log(`  "${pred.name}" (season ${pred.season}, id ${pred.id})`)
		check(pred.status === 'archived', `${pred.season}: status is archived (got ${pred.status})`)
		const predRounds = await db
			.select({ id: round.id })
			.from(round)
			.where(eq(round.competitionId, pred.id))
		const predFixtures =
			predRounds.length > 0
				? await db
						.select()
						.from(fixture)
						.where(
							inArray(
								fixture.roundId,
								predRounds.map((r) => r.id),
							),
						)
				: []
		const statusCounts = new Map<string, number>()
		for (const f of predFixtures) statusCounts.set(f.status, (statusCounts.get(f.status) ?? 0) + 1)
		console.log(
			`    fixtures=${predFixtures.length} status: ${[...statusCounts].map(([s, n]) => `${s}=${n}`).join(' ')}` +
				` | missing scores: ${predFixtures.filter((f) => f.homeScore == null).length}`,
		)
		// The 2026/27-corruption signature: colliding FPL ids and new-season
		// kickoffs on an old season's rows. Both must stay at zero forever.
		const withFplId = predFixtures.filter(
			(f) =>
				f.externalId != null ||
				(f.externalIds as Record<string, string | number> | null)?.fpl != null,
		)
		check(
			withFplId.length === 0,
			`${pred.season}: no fixture carries an FPL id (got ${withFplId.length})`,
		)
		const seasonStart = fdSeason ? new Date(fdSeason.startDate) : null
		const strayKickoffs = seasonStart
			? predFixtures.filter((f) => f.kickoff != null && f.kickoff >= seasonStart)
			: []
		check(
			strayKickoffs.length === 0,
			`${pred.season}: no kickoff on/after the ${season} season start (got ${strayKickoffs.length})`,
		)
	}

	// ── Verdict ───────────────────────────────────────────────────────────
	console.log()
	if (failures.length > 0) {
		console.error(`✖ ${failures.length} check(s) FAILED:`)
		for (const f of failures) console.error(`  - ${f}`)
		process.exit(1)
	}
	if (!current) {
		console.log(
			`Baseline OK (pre-rollover): sources are ready for ${season}; the DB is awaiting the rollover run.`,
		)
	} else {
		console.log(`ALL CHECKS PASSED — "Premier League ${season}" is GW1-ready.`)
	}
	process.exit(0)
}

main().catch((err) => {
	console.error('Inspect failed:', err)
	process.exit(1)
})
