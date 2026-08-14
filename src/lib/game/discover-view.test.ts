import { describe, expect, it } from 'vitest'
import { buildDiscoverView, type DiscoverGameRow } from '@/lib/game/discover-view'

const NOW = new Date('2026-08-14T12:00:00Z')
const SOON = new Date('2026-08-15T18:30:00Z')
const LATER = new Date('2026-08-22T18:30:00Z')
const PAST = new Date('2026-08-08T18:30:00Z')

function row(overrides: Partial<DiscoverGameRow> = {}): DiscoverGameRow {
	const startingRound =
		'startingRound' in overrides
			? (overrides.startingRound ?? null)
			: { id: 'round-1', number: 1, deadline: SOON }
	return {
		id: 'game-1',
		name: 'The Office Cup',
		inviteCode: 'ABC123',
		gameMode: 'classic',
		status: 'active',
		visibility: 'public',
		competitionName: 'Premier League 2026/27',
		competitionType: 'league',
		playerCount: 4,
		maxPlayers: null,
		entryFee: '5.00',
		currentRoundId: startingRound?.id ?? null,
		startingRoundId: startingRound?.id ?? null,
		viewerIsMember: false,
		...overrides,
		startingRound,
	}
}

describe('buildDiscoverView', () => {
	it('lists a public game that is open for entry', () => {
		const view = buildDiscoverView({ games: [row()], now: NOW })

		expect(view.openToJoin.map((g) => g.id)).toEqual(['game-1'])
		expect(view.inProgress).toEqual([])
	})

	it('carries the name, mode, competition, players, entry fee and start', () => {
		const view = buildDiscoverView({
			games: [row({ playerCount: 4, maxPlayers: 12, gameMode: 'turbo' })],
			now: NOW,
		})

		expect(view.openToJoin[0]).toMatchObject({
			name: 'The Office Cup',
			modeLabel: 'Turbo',
			competition: 'Premier League 2026/27',
			playersLabel: '4 of 12 players',
			entryLabel: '£5.00',
			startsAt: SOON,
			startRoundLabel: 'Gameweek 1',
		})
	})

	it('states the player count without a cap when the game sets none', () => {
		const view = buildDiscoverView({ games: [row({ playerCount: 1 })], now: NOW })

		expect(view.openToJoin[0].playersLabel).toBe('1 player')
	})

	it('says a game with no entry fee is free, including a fee of nothing', () => {
		const view = buildDiscoverView({
			games: [
				row({ id: 'no-fee', name: 'A', entryFee: null }),
				row({ id: 'zero-fee', name: 'B', entryFee: '0.00' }),
			],
			now: NOW,
		})

		expect(view.openToJoin.map((g) => g.entryLabel)).toEqual(['Free', 'Free'])
	})

	it('names the round the game is played from, whatever the competition calls it', () => {
		const view = buildDiscoverView({
			games: [row({ startingRound: { id: 'r12', number: 12, deadline: SOON } })],
			now: NOW,
		})

		expect(view.openToJoin[0].startRoundLabel).toBe('Gameweek 12')
	})

	it('orders the open list soonest start first', () => {
		const view = buildDiscoverView({
			games: [
				row({ id: 'late', name: 'Late', startingRound: { id: 'r2', number: 2, deadline: LATER } }),
				row({ id: 'soon', name: 'Soon', startingRound: { id: 'r1', number: 1, deadline: SOON } }),
			],
			now: NOW,
		})

		expect(view.openToJoin.map((g) => g.id)).toEqual(['soon', 'late'])
	})

	it('sorts a game with no start time last, and breaks ties on name', () => {
		const view = buildDiscoverView({
			games: [
				row({
					id: 'tbd',
					name: 'No deadline',
					startingRound: { id: 'r1', number: 1, deadline: null },
				}),
				row({ id: 'zed', name: 'Zed', startingRound: { id: 'r1', number: 1, deadline: SOON } }),
				row({ id: 'ann', name: 'Ann', startingRound: { id: 'r1', number: 1, deadline: SOON } }),
			],
			now: NOW,
		})

		expect(view.openToJoin.map((g) => g.id)).toEqual(['ann', 'zed', 'tbd'])
	})

	it('never lists a private game, in either section', () => {
		const view = buildDiscoverView({
			games: [
				row({ id: 'private-open', visibility: 'private' }),
				row({
					id: 'private-started',
					visibility: 'private',
					startingRound: { id: 'r1', number: 1, deadline: PAST },
				}),
			],
			now: NOW,
		})

		expect(view).toEqual({ openToJoin: [], inProgress: [] })
	})

	it('never lists a game the viewer is already in, in either section', () => {
		const view = buildDiscoverView({
			games: [
				row({ id: 'mine-open', viewerIsMember: true }),
				row({
					id: 'mine-started',
					viewerIsMember: true,
					startingRound: { id: 'r1', number: 1, deadline: PAST },
				}),
			],
			now: NOW,
		})

		expect(view).toEqual({ openToJoin: [], inProgress: [] })
	})

	it('never lists a completed game, in either section', () => {
		const view = buildDiscoverView({
			games: [
				row({ id: 'done', status: 'completed' }),
				row({
					id: 'done-started',
					status: 'completed',
					startingRound: { id: 'r1', number: 1, deadline: PAST },
				}),
			],
			now: NOW,
		})

		expect(view).toEqual({ openToJoin: [], inProgress: [] })
	})

	it('puts a game past its opening deadline in the in-progress section', () => {
		const view = buildDiscoverView({
			games: [row({ startingRound: { id: 'r1', number: 1, deadline: PAST } })],
			now: NOW,
		})

		expect(view.openToJoin).toEqual([])
		expect(view.inProgress.map((g) => g.id)).toEqual(['game-1'])
	})

	it('puts a game that has advanced past its starting round in the in-progress section', () => {
		const view = buildDiscoverView({
			games: [
				row({
					currentRoundId: 'round-2',
					startingRound: { id: 'round-1', number: 1, deadline: LATER },
				}),
			],
			now: NOW,
		})

		expect(view.openToJoin).toEqual([])
		expect(view.inProgress.map((g) => g.id)).toEqual(['game-1'])
	})

	it('orders the in-progress list most recently started first', () => {
		const view = buildDiscoverView({
			games: [
				row({
					id: 'older',
					name: 'Older',
					startingRound: { id: 'r1', number: 1, deadline: new Date('2026-08-01T18:30:00Z') },
				}),
				row({
					id: 'newer',
					name: 'Newer',
					startingRound: { id: 'r1', number: 1, deadline: PAST },
				}),
			],
			now: NOW,
		})

		expect(view.inProgress.map((g) => g.id)).toEqual(['newer', 'older'])
	})

	it('leaves out a game that is neither open nor started', () => {
		const view = buildDiscoverView({
			games: [
				// Still being set up.
				row({ id: 'setup', status: 'setup' }),
				// No starting round recorded — a game we can't place is not one we can
				// call open, nor one we can announce as running.
				row({ id: 'unplaceable', startingRoundId: null, startingRound: null }),
			],
			now: NOW,
		})

		expect(view).toEqual({ openToJoin: [], inProgress: [] })
	})

	it('keeps a game whose opening round carries no deadline open', () => {
		const view = buildDiscoverView({
			games: [
				row({
					competitionType: 'group_knockout',
					startingRound: { id: 'r4', number: 4, deadline: null },
				}),
			],
			now: NOW,
		})

		expect(view.openToJoin[0]).toMatchObject({ startsAt: null, startRoundLabel: 'Round of 32' })
	})
})
