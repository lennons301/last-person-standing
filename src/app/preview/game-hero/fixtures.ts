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
	stats: GameViewStats
	/** Which notice to render inside the hero's notice slot, if any. */
	notice?: 'auto-pick' | 'voided'
}

const BASE_STATS: GameViewStats = {
	potConfirmed: '60.00',
	potTotal: '80.00',
	aliveCount: 5,
	playerCount: 8,
	rebuyAvailable: false,
}

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
			stats: BASE_STATS,
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
			stats: { ...BASE_STATS, rebuyAvailable: true },
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
			stats: BASE_STATS,
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
			stats: BASE_STATS,
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
			stats: BASE_STATS,
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
			stats: BASE_STATS,
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
			stats: { ...BASE_STATS, aliveCount: 4, playerCount: 4 },
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
			stats: { ...BASE_STATS, aliveCount: 4, playerCount: 4 },
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
			stats: { ...BASE_STATS, aliveCount: 4, playerCount: 4 },
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
			stats: {
				...BASE_STATS,
				potConfirmed: '120.00',
				potTotal: '120.00',
				aliveCount: 9,
				playerCount: 12,
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
			stats: {
				...BASE_STATS,
				potConfirmed: '120.00',
				potTotal: '120.00',
				aliveCount: 9,
				playerCount: 12,
			},
			notice: 'voided',
		},
	]
}
