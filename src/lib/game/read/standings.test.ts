import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	select: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
	db: {
		query: { game: { findFirst: mocks.findFirst } },
		select: mocks.select,
	},
}))

import { getProgressGridData } from './standings'

describe('getProgressGridData', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.select.mockReturnValue({
			from: () => ({ where: () => Promise.resolve([{ id: 'u1', name: 'Alice' }]) }),
		})
	})

	it('hides advance picks after a classic player was eliminated', async () => {
		const eliminationRound = {
			id: 'r1',
			number: 1,
			name: 'Gameweek 1',
			status: 'completed',
			deadline: new Date('2026-01-01T12:00:00Z'),
			voidedAt: null,
		}
		const futureRound = {
			id: 'r2',
			number: 2,
			name: 'Gameweek 2',
			status: 'open',
			deadline: new Date('2099-01-01T12:00:00Z'),
			voidedAt: null,
		}
		const team = { id: 't1', shortName: 'ARS' }

		mocks.findFirst.mockResolvedValue({
			id: 'g1',
			gameMode: 'classic',
			status: 'active',
			currentRoundId: futureRound.id,
			startingRoundId: eliminationRound.id,
			players: [
				{
					id: 'gp1',
					userId: 'u1',
					status: 'eliminated',
					eliminatedRoundId: eliminationRound.id,
					eliminatedReason: 'loss',
				},
			],
			competition: {
				id: 'c1',
				type: 'league',
				rounds: [eliminationRound, futureRound],
			},
			picks: [
				{
					id: 'p1',
					gamePlayerId: 'gp1',
					roundId: eliminationRound.id,
					teamId: team.id,
					team,
					round: eliminationRound,
					fixture: null,
					result: 'loss',
					isAuto: false,
					goalsScored: 0,
				},
				{
					id: 'p2',
					gamePlayerId: 'gp1',
					roundId: futureRound.id,
					teamId: team.id,
					team,
					round: futureRound,
					fixture: null,
					result: 'pending',
					isAuto: false,
					goalsScored: 0,
				},
			],
		} as never)

		const result = await getProgressGridData('g1')

		expect(result?.players[0]?.cellsByRoundId).toMatchObject({
			r1: { result: 'loss', teamShortName: 'ARS', eliminatedHere: true },
			r2: { result: 'empty' },
		})
	})
})
