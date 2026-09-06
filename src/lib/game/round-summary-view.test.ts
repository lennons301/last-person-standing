import { describe, expect, it } from 'vitest'
import {
	type BuildRoundSummaryInput,
	buildRoundSummary,
	type RoundSummaryFixtureRow,
	type RoundSummaryFixtureState,
	type RoundSummaryPlayerRow,
	type RoundSummaryRoundRow,
	selectRoundSummaryRound,
} from '@/lib/game/round-summary-view'

/** A fixture nobody has kicked a ball in yet — the state a locked round opens in. */
const SCHEDULED: RoundSummaryFixtureState = {
	status: 'scheduled',
	homeScore: null,
	awayScore: null,
	winner: null,
}

const finished = (
	homeScore: number,
	awayScore: number,
	winner: 'home' | 'away' | null = null,
): RoundSummaryFixtureState => ({ status: 'finished', homeScore, awayScore, winner })

const live = (homeScore: number, awayScore: number): RoundSummaryFixtureState => ({
	status: 'live',
	homeScore,
	awayScore,
	winner: null,
})

/** The canonical round with results written onto the fixtures named. */
function played(states: Record<string, RoundSummaryFixtureState>): RoundSummaryFixtureRow[] {
	return FIXTURES.map((f) => (states[f.id] ? { ...f, state: states[f.id] } : f))
}

/**
 * A three-fixture priced round. Probabilities are the de-vigged 1X2 the sync
 * persists, so each fixture's three outcomes sum to 1 — the tests read expected
 * figures off these literals by hand, never by re-running the builder's own sums.
 */
const FIXTURES: RoundSummaryFixtureRow[] = [
	{
		id: 'fx-1',
		home: { id: 't-ars', shortName: 'ARS', name: 'Arsenal' },
		away: { id: 't-bre', shortName: 'BRE', name: 'Brentford' },
		odds: {
			home: { probability: 0.6, price: 1.6 },
			draw: { probability: 0.24, price: 4.1 },
			away: { probability: 0.16, price: 6.2 },
		},
		state: SCHEDULED,
	},
	{
		id: 'fx-2',
		home: { id: 't-mci', shortName: 'MCI', name: 'Manchester City' },
		away: { id: 't-liv', shortName: 'LIV', name: 'Liverpool' },
		odds: {
			home: { probability: 0.5, price: 2 },
			draw: { probability: 0.25, price: 4 },
			away: { probability: 0.25, price: 4 },
		},
		state: SCHEDULED,
	},
	{
		id: 'fx-3',
		home: { id: 't-eve', shortName: 'EVE', name: 'Everton' },
		away: { id: 't-che', shortName: 'CHE', name: 'Chelsea' },
		odds: {
			home: { probability: 0.2, price: 5 },
			draw: { probability: 0.3, price: 3.3 },
			away: { probability: 0.5, price: 2 },
		},
		state: SCHEDULED,
	},
]

function player(
	name: string,
	teamId: string | null,
	opts: { isAuto?: boolean } = {},
): RoundSummaryPlayerRow {
	return {
		id: `gp-${name.toLowerCase()}`,
		name,
		pick: teamId ? { teamId, isAuto: opts.isAuto ?? false } : null,
	}
}

function input(overrides: Partial<BuildRoundSummaryInput> = {}): BuildRoundSummaryInput {
	return {
		round: { label: 'GW12', longLabel: 'Gameweek 12' },
		nonWinEliminates: true,
		knockout: false,
		fixtures: FIXTURES,
		players: [
			player('Alex', 't-ars'),
			player('Bea', 't-ars'),
			player('Cass', 't-ars'),
			player('Dev', 't-che'),
			player('Sam', null),
		],
		...overrides,
	}
}

describe('buildRoundSummary — the field', () => {
	it('counts picks per team, descending, denominated by players alive going in', () => {
		const view = buildRoundSummary(input())

		expect(view.playersAlive).toBe(5)
		expect(view.picksMade).toBe(4)
		expect(view.mostBacked.map((t) => [t.shortName, t.count])).toEqual([
			['ARS', 3],
			['CHE', 1],
		])
		expect(view.mostBacked[0].players.map((p) => p.name)).toEqual(['Alex', 'Bea', 'Cass'])
	})

	it('reports a player who made no pick at all on their own line', () => {
		const view = buildRoundSummary(input())

		expect(view.noPickPlayers.map((p) => p.name)).toEqual(['Sam'])
	})

	it('leads with the most-backed line, the one headline that needs no prices', () => {
		const view = buildRoundSummary(input())

		expect(view.headline).toBe('3 of 5 on ARS')
	})
})

describe("buildRoundSummary — the market's verdict", () => {
	it('reports the field, the spread, the average win chance and expected survivors', () => {
		const view = buildRoundSummary(input())

		// Three on Arsenal at 0.6 and one on Chelsea away at 0.5.
		expect(view.market).toEqual({
			picks: 4,
			distinctTeams: 2,
			averageWinProbability: 2.3 / 4,
			expectedSurvivors: 2.3,
			pricedPicks: null,
		})
	})

	it('names its denominator only when unpriced picks left it short of the field', () => {
		const view = buildRoundSummary(
			input({
				fixtures: [
					...FIXTURES,
					{
						id: 'fx-4',
						home: { id: 't-new', shortName: 'NEW', name: 'Newcastle' },
						away: { id: 't-ful', shortName: 'FUL', name: 'Fulham' },
						odds: null,
						state: SCHEDULED,
					},
				],
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-che'),
					player('Cass', 't-new'),
					player('Sam', null),
				],
			}),
		)

		expect(view.market).toEqual({
			picks: 3,
			distinctTeams: 3,
			averageWinProbability: 1.1 / 2,
			expectedSurvivors: 1.1,
			pricedPicks: 2,
		})
	})
})

describe('buildRoundSummary — boldest calls', () => {
	it('lists only picks the market does not favour in their own fixture, longest price first', () => {
		const view = buildRoundSummary(
			input({
				players: [
					player('Alex', 't-ars'), // favourite at 0.60
					player('Bea', 't-bre'), // away underdog at 0.16
					player('Cass', 't-liv'), // away underdog at 0.25
					player('Dev', 't-eve'), // home underdog at 0.20
				],
			}),
		)

		expect(view.boldest?.kind).toBe('calls')
		if (view.boldest?.kind !== 'calls') throw new Error('expected calls')
		expect(view.boldest.calls.map((c) => [c.player.name, c.shortName, c.winProbability])).toEqual([
			['Bea', 'BRE', 0.16],
			['Dev', 'EVE', 0.2],
			['Cass', 'LIV', 0.25],
		])
		expect(view.boldest.calls[0].opponentShortName).toBe('ARS')
	})

	it('excludes auto-picks — the system chose the underdog, not the player', () => {
		const view = buildRoundSummary(
			input({
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-bre', { isAuto: true }),
					player('Cass', 't-liv'),
				],
			}),
		)

		if (view.boldest?.kind !== 'calls') throw new Error('expected calls')
		expect(view.boldest.calls.map((c) => c.player.name)).toEqual(['Cass'])
	})

	it('says so when nobody backed an underdog, naming the prices in play', () => {
		const view = buildRoundSummary(input())

		// Canonical field: Arsenal (favourite, 1.6) and Chelsea away (favourite, 2.0).
		expect(view.boldest).toEqual({
			kind: 'none',
			shortest: expect.objectContaining({ shortName: 'ARS', price: 1.6 }),
			longest: expect.objectContaining({ shortName: 'CHE', price: 2 }),
		})
	})

	it('has no prices to quote when every pick in the round was made for a player', () => {
		const view = buildRoundSummary(
			input({
				players: [player('Alex', 't-bre', { isAuto: true })],
			}),
		)

		expect(view.boldest).toEqual({ kind: 'none', shortest: null, longest: null })
	})
})

describe('buildRoundSummary — out on their own', () => {
	it('lists teams exactly one player backed, autos among them and marked', () => {
		const view = buildRoundSummary(
			input({
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-ars'),
					player('Cass', 't-liv'),
					player('Dev', 't-eve', { isAuto: true }),
				],
			}),
		)

		expect(view.lonePicks.map((l) => [l.shortName, l.player.name, l.player.isAuto])).toEqual([
			['LIV', 'Cass', false],
			['EVE', 'Dev', true],
		])
	})
})

describe('buildRoundSummary — left on the table', () => {
	it('names the shortest-priced team nobody picked', () => {
		const view = buildRoundSummary(input())

		// Unpicked: BRE 6.2, MCI 2.0, LIV 4.0, EVE 5.0.
		expect(view.leftOnTable).toEqual(
			expect.objectContaining({ shortName: 'MCI', price: 2, winProbability: 0.5 }),
		)
	})

	it('names nothing when the field covered every team it could have', () => {
		const view = buildRoundSummary(
			input({
				fixtures: [FIXTURES[0]],
				players: [player('Alex', 't-ars'), player('Bea', 't-bre')],
			}),
		)

		expect(view.leftOnTable).toBeNull()
	})
})

describe('buildRoundSummary — head to head', () => {
	const contested = input({
		players: [
			player('Alex', 't-ars'),
			player('Bea', 't-ars'),
			player('Cass', 't-ars'),
			player('Dev', 't-bre'),
			player('Eve', 't-mci'),
			player('Fay', 't-liv'),
		],
	})

	it('lists the fixtures the field sits on both sides of, biggest clash first', () => {
		const view = buildRoundSummary(contested)

		expect(
			view.headToHead.map((h) => [
				h.home.shortName,
				h.home.players.map((p) => p.name),
				h.away.shortName,
				h.away.players.map((p) => p.name),
			]),
		).toEqual([
			['ARS', ['Alex', 'Bea', 'Cass'], 'BRE', ['Dev']],
			['MCI', ['Eve'], 'LIV', ['Fay']],
		])
	})

	it('says a draw takes everyone in the fixture — except where a non-win eliminates nobody', () => {
		expect(buildRoundSummary(contested).headToHead[0].drawTakesAll).toBe(true)
		expect(
			buildRoundSummary({ ...contested, nonWinEliminates: false }).headToHead[0].drawTakesAll,
		).toBe(false)
	})

	it('leaves out a fixture the field only backed one side of', () => {
		const view = buildRoundSummary(input())

		expect(view.headToHead).toEqual([])
	})
})

describe('buildRoundSummary — a competition with no prices', () => {
	const unpriced = input({
		fixtures: FIXTURES.map((f) => ({ ...f, odds: null })),
		players: [
			player('Alex', 't-ars'),
			player('Bea', 't-ars'),
			player('Cass', 't-bre'),
			player('Dev', 't-liv'),
		],
	})

	it('keeps the count tiles and drops the three the market drives', () => {
		const view = buildRoundSummary(unpriced)

		expect(view.oddsAvailable).toBe(false)
		expect(view.market).toBeNull()
		expect(view.boldest).toBeNull()
		expect(view.leftOnTable).toBeNull()
		expect(view.mostBacked.map((t) => [t.shortName, t.count])).toEqual([
			['ARS', 2],
			['BRE', 1],
			['LIV', 1],
		])
		expect(view.lonePicks.map((l) => l.shortName)).toEqual(['BRE', 'LIV'])
		expect(view.headToHead.map((h) => h.fixtureId)).toEqual(['fx-1'])
		expect(view.headline).toBe('2 of 4 on ARS')
	})

	it('renders no figure at all where a price is missing — never a zero', () => {
		const view = buildRoundSummary(unpriced)

		for (const team of view.mostBacked) {
			expect(team.winProbability).toBeNull()
			expect(team.price).toBeNull()
		}
	})

	it('reports prices for the fixtures that have them when only some do', () => {
		const view = buildRoundSummary(
			input({
				fixtures: [FIXTURES[0], { ...FIXTURES[1], odds: null }],
				players: [player('Alex', 't-ars'), player('Bea', 't-mci')],
			}),
		)

		expect(view.oddsAvailable).toBe(true)
		expect(view.mostBacked.map((t) => [t.shortName, t.winProbability])).toEqual([
			['ARS', 0.6],
			['MCI', null],
		])
	})
})

describe('buildRoundSummary — results', () => {
	const field = [
		player('Alex', 't-ars'), // home favourite, 0.60
		player('Bea', 't-bre'), // away underdog, 0.16
		player('Cass', 't-liv'), // away, 0.25
		player('Dev', 't-che'), // away favourite, 0.50
		player('Sam', null),
	]

	it('has nothing to report until a picked fixture has kicked off', () => {
		const view = buildRoundSummary(input({ players: field }))

		expect(view.results).toBeNull()
		expect(view.headline).toBe('1 of 5 on ARS')
	})

	it('stays on the market read while only an unpicked fixture is under way', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({ 'fx-2': live(1, 0) }),
				players: [player('Alex', 't-ars'), player('Dev', 't-che')],
			}),
		)

		expect(view.results).toBeNull()
	})

	it('sorts the survivors by upset and the casualties by price', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({
					'fx-1': finished(0, 1),
					'fx-2': finished(0, 1),
					'fx-3': finished(2, 0),
				}),
				players: field,
			}),
		)

		// Longest price first among the winners; shortest price first among the losses.
		expect(view.results?.through.map((o) => [o.player.name, o.shortName])).toEqual([
			['Bea', 'BRE'],
			['Cass', 'LIV'],
		])
		expect(view.results?.down.map((o) => [o.player.name, o.shortName])).toEqual([
			['Alex', 'ARS'],
			['Dev', 'CHE'],
		])
		expect(view.results?.complete).toBe(true)
	})

	it('carries the scoreline in both spellings, and only where there is one', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({ 'fx-1': finished(2, 0) }),
				players: [player('Alex', 't-ars'), player('Cass', 't-liv')],
			}),
		)

		expect(view.results?.through[0].scoreline).toBe('ARS 2-0 BRE')
		expect(view.results?.through[0].longScoreline).toBe('Arsenal 2-0 Brentford')
		expect(view.results?.stillToPlay[0].scoreline).toBeNull()
	})

	it('leaves a pick still to play while its fixture is in flight, however far ahead', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({ 'fx-1': live(3, 0) }),
				players: [player('Alex', 't-ars')],
			}),
		)

		expect(view.results?.through).toEqual([])
		expect(view.results?.stillToPlay.map((o) => [o.player.name, o.result, o.finished])).toEqual([
			['Alex', 'win', false],
		])
		expect(view.results?.complete).toBe(false)
	})

	it('leads the still-to-play list with the matches in flight', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({ 'fx-1': finished(2, 0), 'fx-3': live(0, 0) }),
				players: field,
			}),
		)

		// Dev's match is on; Cass's has not kicked off, whatever the alphabet says.
		expect(view.results?.stillToPlay.map((o) => o.player.name)).toEqual(['Dev', 'Cass'])
	})

	it('defers a knockout tie the provider has not named a winner for', () => {
		const level = input({
			fixtures: played({ 'fx-1': finished(1, 1) }),
			players: [player('Alex', 't-ars')],
			knockout: true,
		})

		expect(buildRoundSummary(level).results?.stillToPlay.map((o) => o.player.name)).toEqual([
			'Alex',
		])
		// …and settles it as a win the moment the winner lands, penalties and all.
		expect(
			buildRoundSummary({
				...level,
				fixtures: played({ 'fx-1': finished(1, 1, 'home') }),
			}).results?.through.map((o) => o.player.name),
		).toEqual(['Alex'])
	})

	it('counts the beaten and the no-pickers out, and leads on who is left', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({
					'fx-1': finished(2, 0),
					'fx-2': finished(1, 1),
					'fx-3': finished(0, 3),
				}),
				players: field,
			}),
		)

		// Alex through; Bea and Cass beaten; Dev through; Sam never picked.
		expect(view.results?.stillStanding).toBe(2)
		expect(view.headline).toBe('2 of 5 still standing')
	})

	it('counts nobody out where a non-win eliminates nobody', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({
					'fx-1': finished(0, 1),
					'fx-2': finished(1, 1),
					'fx-3': finished(0, 3),
				}),
				players: field,
				nonWinEliminates: false,
			}),
		)

		expect(view.results?.eliminates).toBe(false)
		expect(view.results?.down.map((o) => o.player.name)).toEqual(['Alex', 'Cass'])
		expect(view.results?.stillStanding).toBe(5)
		expect(view.headline).toBe('5 of 5 still standing')
	})

	it('counts what has landed while the round is still going', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({ 'fx-1': finished(2, 0), 'fx-2': live(0, 0) }),
				players: field,
			}),
		)

		expect(view.headline).toBe('1 through, 1 out, 2 to play')
		expect(view.results?.complete).toBe(false)
	})

	it('keeps the market read beside the results rather than throwing it away', () => {
		const view = buildRoundSummary(
			input({
				fixtures: played({ 'fx-1': finished(2, 0) }),
				players: field,
			}),
		)

		expect(view.results).not.toBeNull()
		expect(view.market?.picks).toBe(4)
		expect(view.mostBacked).toHaveLength(4)
	})
})

describe('selectRoundSummaryRound', () => {
	const NOW = new Date('2026-11-21T15:00:00Z')

	function round(
		number: number,
		overrides: Partial<RoundSummaryRoundRow> = {},
	): RoundSummaryRoundRow {
		return {
			id: `r-${number}`,
			number,
			status: 'upcoming',
			deadline: new Date('2026-11-28T11:30:00Z'),
			...overrides,
		}
	}

	const PAST = new Date('2026-11-20T11:30:00Z')

	it('anchors on the most recent locked round, not the round the game moved on to', () => {
		const chosen = selectRoundSummaryRound({
			rounds: [
				round(11, { status: 'completed', deadline: PAST }),
				round(12, { status: 'completed', deadline: PAST }),
				round(13),
			],
			game: { currentRoundId: 'r-13', currentRoundNumber: 13, startingRoundId: 'r-11' },
			latestPickedRoundNumber: 12,
			now: NOW,
		})

		expect(chosen?.id).toBe('r-12')
	})

	it('speaks about the round in play the moment its deadline passes', () => {
		const chosen = selectRoundSummaryRound({
			rounds: [round(11, { status: 'completed', deadline: PAST }), round(12, { deadline: PAST })],
			game: { currentRoundId: 'r-12', currentRoundNumber: 12, startingRoundId: 'r-11' },
			latestPickedRoundNumber: 12,
			now: NOW,
		})

		expect(chosen?.id).toBe('r-12')
	})

	it("has nothing to say before any of the game's own deadlines has passed", () => {
		const chosen = selectRoundSummaryRound({
			rounds: [round(11, { status: 'completed', deadline: PAST }), round(12)],
			game: { currentRoundId: 'r-12', currentRoundNumber: 12, startingRoundId: 'r-12' },
			latestPickedRoundNumber: 12,
			now: NOW,
		})

		expect(chosen).toBeNull()
	})

	it('never reaches past the round the game is on, whatever advance picks exist', () => {
		const chosen = selectRoundSummaryRound({
			rounds: [round(12, { deadline: PAST }), round(13, { deadline: PAST })],
			game: { currentRoundId: 'r-12', currentRoundNumber: 12, startingRoundId: 'r-12' },
			latestPickedRoundNumber: 13,
			now: NOW,
		})

		expect(chosen?.id).toBe('r-12')
	})

	it("stops at the last round a completed game played, not the competition's", () => {
		const chosen = selectRoundSummaryRound({
			rounds: [
				round(12, { status: 'completed', deadline: PAST }),
				round(13, { status: 'completed', deadline: PAST }),
				round(14, { status: 'completed', deadline: PAST }),
			],
			game: { currentRoundId: null, currentRoundNumber: null, startingRoundId: 'r-12' },
			latestPickedRoundNumber: 13,
			now: NOW,
		})

		expect(chosen?.id).toBe('r-13')
	})
})
