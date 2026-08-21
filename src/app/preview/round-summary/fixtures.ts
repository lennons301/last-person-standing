import {
	type BuildRoundSummaryInput,
	buildRoundSummary,
	type RoundSummaryFixtureRow,
	type RoundSummaryPlayerRow,
	type RoundSummaryView,
} from '@/lib/game/round-summary-view'

/**
 * The rounds the summary gallery renders — hand-written as the rows
 * `getRoundSummary` returns, and run through the real `buildRoundSummary`.
 *
 * Hand-built (no database) but never hand-*counted*: what is worth reviewing
 * here is the relationships between figures — a tile absent because the round
 * carries no prices, an auto-pick counted everywhere but the boldest calls, a
 * clash the field sits on both sides of — and a hand-assembled `RoundSummaryView`
 * could assert every one of those without any of them being true.
 */

const ARS = { id: 't-ars', shortName: 'ARS', name: 'Arsenal' }
const BRE = { id: 't-bre', shortName: 'BRE', name: 'Brentford' }
const MCI = { id: 't-mci', shortName: 'MCI', name: 'Manchester City' }
const LIV = { id: 't-liv', shortName: 'LIV', name: 'Liverpool' }
const EVE = { id: 't-eve', shortName: 'EVE', name: 'Everton' }
const CHE = { id: 't-che', shortName: 'CHE', name: 'Chelsea' }
const NEW = { id: 't-new', shortName: 'NEW', name: 'Newcastle' }
const FUL = { id: 't-ful', shortName: 'FUL', name: 'Fulham' }

/** A priced gameweek: four matches, the whole de-vigged 1X2 on each. */
const PRICED: RoundSummaryFixtureRow[] = [
	{
		id: 'fx-1',
		home: ARS,
		away: BRE,
		odds: {
			home: { probability: 0.6, price: 1.6 },
			draw: { probability: 0.24, price: 4.1 },
			away: { probability: 0.16, price: 6.2 },
		},
	},
	{
		id: 'fx-2',
		home: MCI,
		away: LIV,
		odds: {
			home: { probability: 0.5, price: 2 },
			draw: { probability: 0.25, price: 4 },
			away: { probability: 0.25, price: 4 },
		},
	},
	{
		id: 'fx-3',
		home: EVE,
		away: CHE,
		odds: {
			home: { probability: 0.2, price: 5 },
			draw: { probability: 0.3, price: 3.3 },
			away: { probability: 0.5, price: 2 },
		},
	},
	{
		id: 'fx-4',
		home: NEW,
		away: FUL,
		odds: {
			home: { probability: 0.45, price: 2.2 },
			draw: { probability: 0.27, price: 3.7 },
			away: { probability: 0.28, price: 3.6 },
		},
	},
]

/** The same round with the prices taken away: a World Cup or FA Cup classic game. */
const UNPRICED: RoundSummaryFixtureRow[] = PRICED.map((f) => ({ ...f, odds: null }))

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

function round(overrides: Partial<BuildRoundSummaryInput>): RoundSummaryView {
	return buildRoundSummary({
		round: { label: 'GW12', longLabel: 'Gameweek 12' },
		isStartingRound: false,
		fixtures: PRICED,
		players: [],
		...overrides,
	})
}

export interface RoundSummaryFixtureCase {
	key: string
	title: string
	description: string
	summary: RoundSummaryView
}

export const ROUND_SUMMARY_CASES: RoundSummaryFixtureCase[] = [
	{
		key: 'canonical',
		title: 'A priced round',
		description:
			'Nine players, a crowd on the favourite, two gamblers, two lone picks and a clash the field sits on both sides of. Every figure carries its decimal price and its win chance.',
		summary: round({
			players: [
				player('Alex', ARS.id),
				player('Bea', ARS.id),
				player('Cass', ARS.id),
				player('Dev', ARS.id),
				player('Eve', BRE.id),
				player('Fay', CHE.id),
				player('Gus', LIV.id),
				player('Hal', NEW.id),
				player('Ines', MCI.id),
			],
		}),
	},
	{
		key: 'unpriced',
		title: 'A competition with no prices',
		description:
			'The World Cup and the FA Cup carry no bookmaker prices, and classic is offered on both. The three count tiles stand; the three the market drives are absent, with one line saying why.',
		summary: round({
			fixtures: UNPRICED,
			players: [
				player('Alex', ARS.id),
				player('Bea', ARS.id),
				player('Cass', ARS.id),
				player('Dev', BRE.id),
				player('Eve', LIV.id),
				player('Fay', CHE.id),
			],
		}),
	},
	{
		key: 'no-underdogs',
		title: 'Nobody backed an underdog',
		description:
			"Every pick was its match's favourite, so the tile says so and reports the two ends of what the field actually took rather than rendering an empty list.",
		summary: round({
			players: [
				player('Alex', ARS.id),
				player('Bea', ARS.id),
				player('Cass', MCI.id),
				player('Dev', CHE.id),
				player('Eve', NEW.id),
			],
		}),
	},
	{
		key: 'no-clash',
		title: 'No contested fixture',
		description:
			'Nobody is on the other side of anybody else, so Head to head drops out entirely — there is no clash to state stakes for.',
		summary: round({
			players: [player('Alex', ARS.id), player('Bea', MCI.id), player('Cass', NEW.id)],
		}),
	},
	{
		key: 'unanimous',
		title: 'The whole field on one team',
		description:
			'One team, one row, and no lone picks at all: eight of eight on the favourite. Expected survivors is that price times the field.',
		summary: round({
			players: [
				player('Alex', ARS.id),
				player('Bea', ARS.id),
				player('Cass', ARS.id),
				player('Dev', ARS.id),
				player('Eve', ARS.id),
				player('Fay', ARS.id),
				player('Gus', ARS.id),
				player('Hal', ARS.id),
			],
		}),
	},
	{
		key: 'auto-picks',
		title: 'A round containing auto-picks',
		description:
			'Auto-picks count in every tile but the boldest calls — the system took the lowest-ranked team after the deadline, and naming the player for that gamble would be untrue. They are marked (auto) wherever they are named.',
		summary: round({
			players: [
				player('Alex', ARS.id),
				player('Bea', ARS.id),
				player('Cass', BRE.id, { isAuto: true }),
				player('Dev', EVE.id, { isAuto: true }),
				player('Eve', LIV.id),
				player('Fay', CHE.id),
			],
		}),
	},
	{
		key: 'no-pick',
		title: 'A player made no pick',
		description:
			'The counts do not sum to the field, and the player the deadline caught with nothing in is reported on their own line — which is itself the news.',
		summary: round({
			players: [
				player('Alex', ARS.id),
				player('Bea', ARS.id),
				player('Cass', BRE.id),
				player('Dev', CHE.id),
				player('Sam', null),
			],
		}),
	},
	{
		key: 'two-player',
		title: 'A two-player field',
		description:
			'The endgame: two left, both named, and the pair on opposite sides of one match is the whole summary.',
		summary: round({
			players: [player('Alex', ARS.id), player('Bea', BRE.id)],
		}),
	},
]
