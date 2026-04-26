import { beforeEach, describe, expect, it, vi } from 'vitest'

const { processClassicRoundMock } = vi.hoisted(() => ({
	processClassicRoundMock: vi.fn(),
}))
vi.mock('@/lib/game-logic/classic', () => ({
	processClassicRound: processClassicRoundMock,
}))

// Minimal Drizzle mock — mirrors structure used in the real callers.
const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			game: { findFirst: vi.fn() },
			round: { findFirst: vi.fn() },
			pick: { findMany: vi.fn() },
			gamePlayer: { findMany: vi.fn() },
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
		})),
	},
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { processGameRound } from './process-round'

function makeClassicGameAndRound(opts: { roundNumber: number; allowRebuys?: boolean }) {
	dbMock.query.game.findFirst.mockResolvedValue({
		id: 'g1',
		gameMode: 'classic',
		modeConfig: opts.allowRebuys ? { allowRebuys: true } : {},
		players: [],
		competition: { type: 'standard' },
		competitionId: 'c1',
	} as never)
	dbMock.query.round.findFirst.mockResolvedValue({
		id: 'r1',
		number: opts.roundNumber,
		fixtures: [{ status: 'finished', homeScore: 0, awayScore: 0 }],
	} as never)
	dbMock.query.pick.findMany.mockResolvedValue([])
	processClassicRoundMock.mockReturnValue({ results: [] })
}

describe('processGameRound: isStartingRound derivation', () => {
	beforeEach(() => vi.clearAllMocks())

	it('passes isStartingRound=true when round 1 and allowRebuys is not set', async () => {
		makeClassicGameAndRound({ roundNumber: 1 })
		await processGameRound('g1', 'r1')
		expect(processClassicRoundMock).toHaveBeenCalledWith(
			expect.objectContaining({ isStartingRound: true }),
		)
	})

	it('passes isStartingRound=false when round 1 but allowRebuys=true', async () => {
		makeClassicGameAndRound({ roundNumber: 1, allowRebuys: true })
		await processGameRound('g1', 'r1')
		expect(processClassicRoundMock).toHaveBeenCalledWith(
			expect.objectContaining({ isStartingRound: false }),
		)
	})

	it('passes isStartingRound=false for round 2 regardless of allowRebuys', async () => {
		makeClassicGameAndRound({ roundNumber: 2, allowRebuys: true })
		await processGameRound('g1', 'r1')
		expect(processClassicRoundMock).toHaveBeenCalledWith(
			expect.objectContaining({ isStartingRound: false }),
		)
	})
})
