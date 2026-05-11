/**
 * One-off audit script: verify WC FIFA-pot coverage end-to-end.
 *
 * Connects to the DB, finds the WC competition + all its teams, and reports:
 *   - Which teams are pot-tagged vs missing
 *   - For each round's fixtures: home pot, away pot, tier difference
 *   - Any team in the DB that didn't match WC_2026_POTS (alias gap)
 *
 * Use this to answer "why doesn't team X get a tier difference" without
 * guessing what football-data is calling the team.
 *
 * Run:
 *   pnpm doppler run -p lps -c prd -- pnpm tsx scripts/audit-wc-pot-coverage.ts
 *
 * Read-only. No mutations.
 */
import { and, eq } from 'drizzle-orm'
import { WC_2026_POTS } from '../src/lib/data/wc-pots'
import { db } from '../src/lib/db'
import { competition, fixture, round, team } from '../src/lib/schema/competition'

async function main() {
	const wc = await db.query.competition.findFirst({
		where: and(eq(competition.dataSource, 'football_data'), eq(competition.externalId, 'WC')),
	})
	if (!wc) {
		console.error('No WC competition found in DB.')
		process.exit(1)
	}

	const rounds = await db.query.round.findMany({
		where: eq(round.competitionId, wc.id),
		with: { fixtures: { with: { homeTeam: true, awayTeam: true } } },
		orderBy: (r, { asc }) => asc(r.number),
	})

	const allTeamIds = new Set<string>()
	for (const r of rounds) {
		for (const f of r.fixtures) {
			allTeamIds.add(f.homeTeamId)
			allTeamIds.add(f.awayTeamId)
		}
	}
	const teams = await db.query.team.findMany({})
	const teamById = new Map(teams.map((t) => [t.id, t]))

	console.log(`\n=== WC Competition: ${wc.name} (${wc.season}) ===\n`)
	console.log(`Total rounds: ${rounds.length}`)
	console.log(`Total unique teams in fixtures: ${allTeamIds.size}`)
	console.log(`WC_2026_POTS list size: ${WC_2026_POTS.length}\n`)

	// --- Coverage of teams in the DB ---
	console.log('--- Team pot coverage ---')
	const missingPotTeams: string[] = []
	const taggedTeams: Array<{ name: string; pot: number }> = []
	for (const tid of allTeamIds) {
		const t = teamById.get(tid)
		if (!t) continue
		const pot = (t.externalIds as Record<string, string | number> | null)?.fifa_pot
		if (pot == null) {
			missingPotTeams.push(t.name)
		} else {
			taggedTeams.push({ name: t.name, pot: Number(pot) })
		}
	}
	console.log(`Tagged with fifa_pot: ${taggedTeams.length}`)
	console.log(`MISSING fifa_pot: ${missingPotTeams.length}`)
	if (missingPotTeams.length > 0) {
		console.log('  → These teams will have tier_diff = 0 in every fixture:')
		for (const n of missingPotTeams.sort()) console.log(`    - ${n}`)
	}

	// --- WC_2026_POTS entries that no DB team matched ---
	console.log('\n--- WC_2026_POTS entries with no matching DB team ---')
	const dbNamesLower = new Set(
		Array.from(allTeamIds)
			.map((tid) => teamById.get(tid)?.name?.toLowerCase())
			.filter((n): n is string => !!n),
	)
	const unmatchedPotEntries = WC_2026_POTS.filter((p) => !dbNamesLower.has(p.name.toLowerCase()))
	if (unmatchedPotEntries.length === 0) {
		console.log('  (none — every pot entry has a DB team with the same lowercase name)')
	} else {
		for (const p of unmatchedPotEntries) {
			console.log(
				`  - "${p.name}" (Pot ${p.pot})${p.tbd ? ' [TBD playoff winner]' : ' [REAL TEAM — alias likely needed]'}`,
			)
		}
	}

	// --- Per-round fixture analysis ---
	console.log('\n--- Fixture-by-fixture tier coverage ---')
	for (const r of rounds) {
		if (r.fixtures.length === 0) continue
		console.log(`\nRound ${r.number} (${r.name ?? 'unnamed'}):`)
		for (const f of r.fixtures) {
			const home = teamById.get(f.homeTeamId)
			const away = teamById.get(f.awayTeamId)
			const homePot = Number(
				(home?.externalIds as Record<string, string | number> | null)?.fifa_pot,
			)
			const awayPot = Number(
				(away?.externalIds as Record<string, string | number> | null)?.fifa_pot,
			)
			const tierDiff =
				Number.isFinite(homePot) && Number.isFinite(awayPot) ? homePot - awayPot : null
			const tierLabel = tierDiff == null ? 'NO POTS' : tierDiff === 0 ? '=' : tierDiff
			console.log(
				`  ${home?.name ?? '?'} (pot ${Number.isFinite(homePot) ? homePot : '?'}) vs ${away?.name ?? '?'} (pot ${Number.isFinite(awayPot) ? awayPot : '?'}) → tier diff ${tierLabel}`,
			)
		}
	}

	console.log('\n=== Done ===')
	process.exit(0)
}

main().catch((err) => {
	console.error('Audit failed:', err)
	process.exit(1)
})
