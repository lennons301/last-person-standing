import type { GameHeroDescriptor, GameViewStats, HeroRound } from '@/lib/game/game-view'

/**
 * Hand-built descriptors for the game-hero gallery — one entry per state × mode.
 * Deliberately not derived from `buildGameView`: the gallery is here to review
 * the *rendering* of every variant, including combinations a live database
 * rarely produces on demand.
 *
 * Later tickets in the hierarchy redesign add their own variants here as they
 * implement them.
 */
export interface HeroFixture {
	id: string
	title: string
	note?: string
	hero: GameHeroDescriptor
	/** Which notice to render inside the hero's notice slot, if any. */
	notice?: 'auto-pick' | 'voided'
}

const BASE_STATS: GameViewStats = {
	potConfirmed: '60.00',
	potPending: '20.00',
	potTotal: '80.00',
	potUnpaid: '20.00',
	potTarget: '100.00',
	aliveCount: 5,
	playerCount: 8,
	rebuyAvailable: false,
}

/** Stat-line-only fixtures — the line is page-level chrome, not part of a hero. */
export interface StatLineFixture {
	id: string
	title: string
	note?: string
	stats: GameViewStats
	/** Renders the viewer's own "unpaid — settle up" aside on the line. */
	unpaid?: { amount: string; status: 'pending' | 'claimed' }
}

export const STAT_LINE_FIXTURES: StatLineFixture[] = [
	{
		id: 'stat-line-everyone-paid',
		title: 'Stat line · everyone paid',
		note: 'Nothing outstanding — the pot equals its target.',
		stats: {
			potConfirmed: '120.00',
			potPending: '0.00',
			potTotal: '120.00',
			potUnpaid: '0.00',
			potTarget: '120.00',
			aliveCount: 8,
			playerCount: 12,
			rebuyAvailable: false,
		},
	},
	{
		id: 'stat-line-money-outstanding',
		title: 'Stat line · money outstanding',
		note: 'Tap the pot for the confirmed / pending / unpaid / target breakdown.',
		stats: BASE_STATS,
	},
	{
		id: 'stat-line-rebuy',
		title: 'Stat line · rebuy available',
		stats: { ...BASE_STATS, aliveCount: 1, playerCount: 12, rebuyAvailable: true },
	},
	{
		id: 'stat-line-unpaid-notice',
		title: 'Stat line · viewer owes money',
		note: 'The quiet inline notice that replaced the full-width payment band.',
		stats: BASE_STATS,
		unpaid: { amount: '10.00', status: 'pending' },
	},
	{
		id: 'stat-line-unpaid-claimed',
		title: 'Stat line · viewer has claimed payment',
		note: 'Claimed but not yet confirmed by the organiser.',
		stats: BASE_STATS,
		unpaid: { amount: '10.00', status: 'claimed' },
	},
]

function hours(now: Date, n: number): string {
	return new Date(now.getTime() + n * 60 * 60 * 1000).toISOString()
}

/**
 * `now` is an argument for the same reason `buildGameView` takes one: the
 * deadlines are rendered relative to it, and the gallery should never reach for
 * a wall clock in the middle of a fixture list.
 */
export function buildHeroFixtures(now: Date): HeroFixture[] {
	const plRound = (deadlineIso: string | null): HeroRound => ({
		number: 7,
		label: 'GW7',
		longLabel: 'Gameweek 7',
		deadlineIso,
	})
	const cupRound: HeroRound = {
		number: 3,
		label: 'R16',
		longLabel: 'Round of 16',
		deadlineIso: hours(now, 30),
	}

	return [
		{
			id: 'classic-pick-open',
			title: 'Classic · pick-open',
			note: 'No pick yet — the loud call to action.',
			hero: {
				kind: 'pick-open',
				mode: 'classic',
				round: plRound(hours(now, 52)),
				picksMade: 0,
				picksRequired: 1,
				actingAsName: null,
			},
		},
		{
			id: 'classic-pick-open-deadline-soon',
			title: 'Classic · pick-open (deadline soon, rebuy available)',
			hero: {
				kind: 'pick-open',
				mode: 'classic',
				round: plRound(hours(now, 2)),
				picksMade: 0,
				picksRequired: 1,
				actingAsName: null,
			},
		},
		{
			id: 'classic-pick-open-acting-as',
			title: 'Classic · pick-open (admin acting as another player)',
			hero: {
				kind: 'pick-open',
				mode: 'classic',
				round: plRound(hours(now, 52)),
				picksMade: 0,
				picksRequired: 1,
				actingAsName: 'Dave',
			},
		},
		{
			id: 'classic-pick-made',
			title: 'Classic · pick-made',
			note: 'Stays like this until the deadline passes.',
			hero: {
				kind: 'pick-made',
				mode: 'classic',
				round: plRound(hours(now, 52)),
				pick: {
					type: 'team',
					shortName: 'ARS',
					name: 'Arsenal',
					opponentName: 'Everton',
					side: 'home',
					kickoffIso: hours(now, 60),
					isAuto: false,
				},
				actingAsName: null,
			},
		},
		{
			id: 'classic-pick-made-auto',
			title: 'Classic · pick-made (auto-pick notice inside the hero)',
			hero: {
				kind: 'pick-made',
				mode: 'classic',
				round: plRound(hours(now, 52)),
				pick: {
					type: 'team',
					shortName: 'BUR',
					name: 'Burnley',
					opponentName: 'Manchester City',
					side: 'away',
					kickoffIso: hours(now, 61),
					isAuto: true,
				},
				actingAsName: null,
			},
			notice: 'auto-pick',
		},
		{
			id: 'classic-pick-made-deadline-tbc',
			title: 'Classic · pick-made (deadline TBC, kick-off unknown)',
			hero: {
				kind: 'pick-made',
				mode: 'classic',
				round: plRound(null),
				pick: {
					type: 'team',
					shortName: 'LIV',
					name: 'Liverpool',
					opponentName: null,
					side: null,
					kickoffIso: null,
					isAuto: false,
				},
				actingAsName: null,
			},
		},
		{
			id: 'turbo-pick-open',
			title: 'Turbo · pick-open',
			hero: {
				kind: 'pick-open',
				mode: 'turbo',
				round: plRound(hours(now, 52)),
				picksMade: 0,
				picksRequired: 10,
				actingAsName: null,
			},
		},
		{
			id: 'turbo-pick-open-partial',
			title: 'Turbo · pick-open (partial entry)',
			note: 'A half-finished ranking is still an open pick.',
			hero: {
				kind: 'pick-open',
				mode: 'turbo',
				round: plRound(hours(now, 20)),
				picksMade: 4,
				picksRequired: 10,
				actingAsName: null,
			},
		},
		{
			id: 'turbo-pick-made',
			title: 'Turbo · pick-made',
			hero: {
				kind: 'pick-made',
				mode: 'turbo',
				round: plRound(hours(now, 20)),
				pick: { type: 'ranked', picksMade: 10, picksRequired: 10, isAuto: false },
				actingAsName: null,
			},
		},
		{
			id: 'cup-pick-open',
			title: 'Cup · pick-open',
			hero: {
				kind: 'pick-open',
				mode: 'cup',
				round: cupRound,
				picksMade: 0,
				picksRequired: 6,
				actingAsName: null,
			},
		},
		{
			id: 'cup-pick-made',
			title: 'Cup · pick-made (voided-pick notice inside the hero)',
			hero: {
				kind: 'pick-made',
				mode: 'cup',
				round: cupRound,
				pick: { type: 'ranked', picksMade: 6, picksRequired: 6, isAuto: false },
				actingAsName: 'Rachel',
			},
			notice: 'voided',
		},
	]
}
