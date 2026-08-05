import type {
	GameHeroDescriptor,
	GameViewStats,
	HeroFixtureSnapshot,
	HeroRound,
} from '@/lib/game/game-view'

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

	const scoreboard = (overrides: Partial<HeroFixtureSnapshot> = {}): HeroFixtureSnapshot => ({
		id: 'fixture-1',
		status: 'live',
		homeShort: 'ARS',
		awayShort: 'EVE',
		homeScore: 1,
		awayScore: 0,
		kickoffIso: hours(now, -1),
		...overrides,
	})

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

		// ── Post-deadline: the round is in play ────────────────────────────────
		{
			id: 'classic-live-surviving',
			title: 'Classic · live (surviving)',
			note: 'The personal read only — the ticker above and the standings below cover the field.',
			hero: {
				kind: 'live',
				mode: 'classic',
				round: plRound(hours(now, -3)),
				entry: {
					type: 'team',
					shortName: 'ARS',
					name: 'Arsenal',
					opponentName: 'Everton',
					side: 'home',
					fixture: scoreboard(),
				},
				survival: 'surviving',
				actingAsName: null,
			},
			stats: BASE_STATS,
		},
		{
			id: 'classic-live-at-risk',
			title: 'Classic · live (level, at risk)',
			hero: {
				kind: 'live',
				mode: 'classic',
				round: plRound(hours(now, -3)),
				entry: {
					type: 'team',
					shortName: 'ARS',
					name: 'Arsenal',
					opponentName: 'Everton',
					side: 'home',
					fixture: scoreboard({ homeScore: 1, awayScore: 1 }),
				},
				survival: 'at-risk',
				actingAsName: null,
			},
			stats: BASE_STATS,
		},
		{
			id: 'classic-live-out',
			title: 'Classic · live (pick lost at full time)',
			hero: {
				kind: 'live',
				mode: 'classic',
				round: plRound(hours(now, -3)),
				entry: {
					type: 'team',
					shortName: 'BUR',
					name: 'Burnley',
					opponentName: 'Manchester City',
					side: 'away',
					fixture: scoreboard({
						status: 'finished',
						homeShort: 'MCI',
						awayShort: 'BUR',
						homeScore: 3,
						awayScore: 0,
					}),
				},
				survival: 'out',
				actingAsName: null,
			},
			stats: BASE_STATS,
		},
		{
			id: 'classic-live-no-pick',
			title: 'Classic · live (deadline missed, no pick)',
			hero: {
				kind: 'live',
				mode: 'classic',
				round: plRound(hours(now, -3)),
				entry: { type: 'none' },
				survival: 'out',
				actingAsName: null,
			},
			stats: BASE_STATS,
		},
		{
			id: 'classic-live-not-started',
			title: 'Classic · live (pick kicks off later)',
			hero: {
				kind: 'live',
				mode: 'classic',
				round: plRound(hours(now, -3)),
				entry: {
					type: 'team',
					shortName: 'LIV',
					name: 'Liverpool',
					opponentName: 'Brighton',
					side: 'home',
					fixture: scoreboard({
						status: 'scheduled',
						homeShort: 'LIV',
						awayShort: 'BHA',
						homeScore: null,
						awayScore: null,
						kickoffIso: hours(now, 4),
					}),
				},
				survival: 'unknown',
				actingAsName: null,
			},
			stats: BASE_STATS,
		},
		{
			id: 'turbo-live',
			title: 'Turbo · live',
			note: 'No elimination in turbo, so no survival verdict — just the running count.',
			hero: {
				kind: 'live',
				mode: 'turbo',
				round: plRound(hours(now, -3)),
				entry: {
					type: 'ranked',
					picksMade: 10,
					picksRequired: 10,
					correct: 6,
					wrong: 2,
					pending: 2,
					livesRemaining: null,
				},
				survival: 'unknown',
				actingAsName: null,
			},
			stats: { ...BASE_STATS, aliveCount: 4, playerCount: 4 },
		},
		{
			id: 'cup-live-last-life',
			title: 'Cup · live (out of lives, at risk)',
			hero: {
				kind: 'live',
				mode: 'cup',
				round: { ...cupRound, deadlineIso: hours(now, -2) },
				entry: {
					type: 'ranked',
					picksMade: 6,
					picksRequired: 6,
					correct: 3,
					wrong: 2,
					pending: 1,
					livesRemaining: 0,
				},
				survival: 'at-risk',
				actingAsName: null,
			},
			stats: {
				...BASE_STATS,
				potConfirmed: '120.00',
				potTotal: '120.00',
				aliveCount: 5,
				playerCount: 12,
			},
		},

		// ── Post-deadline: the round has been settled ──────────────────────────
		{
			id: 'classic-round-result-survived',
			title: 'Classic · round-result (survived)',
			hero: {
				kind: 'round-result',
				mode: 'classic',
				round: plRound(hours(now, -50)),
				entry: {
					type: 'team',
					shortName: 'ARS',
					name: 'Arsenal',
					opponentName: 'Everton',
					side: 'home',
					fixture: scoreboard({ status: 'finished', homeScore: 2, awayScore: 1 }),
				},
				result: 'survived',
				nextRound: {
					number: 8,
					label: 'GW8',
					longLabel: 'Gameweek 8',
					deadlineIso: hours(now, 100),
				},
				actingAsName: null,
			},
			stats: { ...BASE_STATS, aliveCount: 4 },
		},
		{
			id: 'classic-round-result-eliminated',
			title: 'Classic · round-result (eliminated)',
			hero: {
				kind: 'round-result',
				mode: 'classic',
				round: plRound(hours(now, -50)),
				entry: {
					type: 'team',
					shortName: 'BUR',
					name: 'Burnley',
					opponentName: 'Manchester City',
					side: 'away',
					fixture: scoreboard({
						status: 'finished',
						homeShort: 'MCI',
						awayShort: 'BUR',
						homeScore: 3,
						awayScore: 0,
					}),
				},
				result: 'eliminated',
				nextRound: {
					number: 8,
					label: 'GW8',
					longLabel: 'Gameweek 8',
					deadlineIso: hours(now, 100),
				},
				actingAsName: null,
			},
			stats: { ...BASE_STATS, aliveCount: 4 },
		},
		{
			id: 'turbo-round-result',
			title: 'Turbo · round-result',
			note: 'Single-round mode: the round ending is not a survival verdict.',
			hero: {
				kind: 'round-result',
				mode: 'turbo',
				round: plRound(hours(now, -50)),
				entry: {
					type: 'ranked',
					picksMade: 10,
					picksRequired: 10,
					correct: 7,
					wrong: 3,
					pending: 0,
					livesRemaining: null,
				},
				result: 'played',
				nextRound: null,
				actingAsName: null,
			},
			stats: { ...BASE_STATS, aliveCount: 4, playerCount: 4 },
		},
		{
			id: 'cup-round-result',
			title: 'Cup · round-result',
			hero: {
				kind: 'round-result',
				mode: 'cup',
				round: { ...cupRound, deadlineIso: hours(now, -50) },
				entry: {
					type: 'ranked',
					picksMade: 6,
					picksRequired: 6,
					correct: 4,
					wrong: 2,
					pending: 0,
					livesRemaining: 1,
				},
				result: 'played',
				nextRound: null,
				actingAsName: null,
			},
			stats: {
				...BASE_STATS,
				potConfirmed: '120.00',
				potTotal: '120.00',
				aliveCount: 5,
				playerCount: 12,
			},
		},

		// ── Completed games ───────────────────────────────────────────────────
		// All three carry `round: null` because that's the only shape production
		// produces: `applyAutoCompletion` nulls out `game.currentRoundId` when it
		// crowns a winner, so the page has no round to hand the deriver. The hero
		// drops its round line and leads with the outcome.
		{
			id: 'classic-winner-viewer',
			title: 'Classic · winner (the viewer won)',
			note: 'No round line — a completed game has no current round.',
			hero: {
				kind: 'winner',
				mode: 'classic',
				round: null,
				winners: [
					{
						userId: 'user-1',
						name: 'Sean',
						potShare: '80.00',
						stats: [{ iconKey: 'list-checks', value: 7, label: 'rounds' }],
					},
				],
				runnerUpName: 'Dave',
				viewerOutcome: 'won',
				viewerPotShare: '80.00',
			},
			stats: { ...BASE_STATS, aliveCount: 1 },
		},
		{
			id: 'turbo-winner-someone-else',
			title: 'Turbo · winner (someone else won)',
			hero: {
				kind: 'winner',
				mode: 'turbo',
				round: null,
				winners: [
					{
						userId: 'user-2',
						name: 'Rachel',
						potShare: '50.00',
						stats: [
							{ iconKey: 'flame', value: 6, label: 'streak' },
							{ iconKey: 'target', value: 14, label: 'goals' },
						],
					},
				],
				runnerUpName: 'Sean',
				viewerOutcome: 'lost',
				viewerPotShare: null,
			},
			stats: { ...BASE_STATS, aliveCount: 1, playerCount: 5 },
		},
		{
			id: 'cup-winner-split',
			title: 'Cup · winner (split pot, viewer shares it)',
			note: 'An odd pot splits unevenly — the heading quotes the viewer their own cut.',
			hero: {
				kind: 'winner',
				mode: 'cup',
				round: null,
				winners: [
					{
						userId: 'user-1',
						name: 'Sean',
						potShare: '60.01',
						stats: [
							{ iconKey: 'heart', value: 2, label: 'lives' },
							{ iconKey: 'flame', value: 5, label: 'streak' },
							{ iconKey: 'target', value: 9, label: 'goals' },
						],
					},
					{
						userId: 'user-2',
						name: 'Dave',
						potShare: '60.00',
						stats: [
							{ iconKey: 'heart', value: 2, label: 'lives' },
							{ iconKey: 'flame', value: 5, label: 'streak' },
							{ iconKey: 'target', value: 7, label: 'goals' },
						],
					},
				],
				runnerUpName: 'Rachel',
				viewerOutcome: 'shared',
				// Dave's cut, not Sean's — the pot didn't divide evenly.
				viewerPotShare: '60.00',
			},
			stats: {
				...BASE_STATS,
				potConfirmed: '120.01',
				potTotal: '120.01',
				aliveCount: 2,
				playerCount: 12,
			},
		},

		// ── Out of the game (classic only) ────────────────────────────────────
		{
			id: 'classic-rebuy',
			title: 'Classic · rebuy (offer standing)',
			note: 'The buttons come from the page, not the hero — see the action slot.',
			hero: {
				kind: 'rebuy',
				mode: 'classic',
				round: plRound(hours(now, 26)),
				entryFee: '10.00',
				closesAtIso: hours(now, 26),
				pendingPayment: null,
				eliminatedRoundLabel: 'GW1',
			},
			stats: { ...BASE_STATS, rebuyAvailable: true },
		},
		{
			id: 'classic-rebuy-pending',
			title: 'Classic · rebuy (payment pending)',
			hero: {
				kind: 'rebuy',
				mode: 'classic',
				round: plRound(hours(now, 26)),
				entryFee: '10.00',
				closesAtIso: hours(now, 26),
				pendingPayment: { id: 'payment-1', amount: '10.00' },
				eliminatedRoundLabel: 'GW1',
			},
			stats: { ...BASE_STATS, rebuyAvailable: true },
		},
		{
			id: 'classic-spectator',
			title: 'Classic · spectator (eliminated, no rebuy)',
			note: 'Deliberately the quietest variant — standings and live scores are the page now.',
			hero: {
				kind: 'spectator',
				mode: 'classic',
				round: plRound(hours(now, -3)),
				eliminatedRoundLabel: 'GW34',
			},
			stats: { ...BASE_STATS, aliveCount: 2 },
		},
	]
}
