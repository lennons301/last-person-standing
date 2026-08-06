import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { submitPlannedPick } from './auto-submit'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			plannedPick: { findFirst: vi.fn() },
			gamePlayer: { findFirst: vi.fn() },
			pick: { findFirst: vi.fn() },
			fixture: { findMany: vi.fn() },
		},
		insert: vi.fn(),
		delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
	},
}))

function mockInsert(returned: unknown[]) {
	const returning = vi.fn().mockResolvedValue(returned)
	const onConflictDoNothing = vi.fn(() => ({ returning }))
	const values = vi.fn(() => ({ onConflictDoNothing }))
	vi.mocked(db.insert).mockReturnValue({ values } as never)
	return { values, onConflictDoNothing }
}

describe('submitPlannedPick', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(db.query.plannedPick.findFirst).mockResolvedValue({
			id: 'plan1',
			gamePlayerId: 'gp1',
			roundId: 'r1',
			teamId: 't-home',
		} as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
			id: 'gp1',
			gameId: 'g1',
			status: 'alive',
		} as never)
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
		vi.mocked(db.query.fixture.findMany).mockResolvedValue([
			{ id: 'fx1', homeTeamId: 't-home', awayTeamId: 't-away', kickoff: new Date() },
		] as never)
	})

	it('submits the planned pick and clears the plan', async () => {
		const { values } = mockInsert([{ id: 'pick1' }])

		expect(await submitPlannedPick('gp1', 'r1', 't-home')).toEqual({ submitted: true })
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({ gamePlayerId: 'gp1', roundId: 'r1', autoSubmitted: true }),
		)
		expect(db.delete).toHaveBeenCalledTimes(1)
	})

	it('reports already-picked when a concurrent writer won the insert (#127)', async () => {
		// The unique index rejected the row: on conflict do nothing returns nothing.
		mockInsert([])

		expect(await submitPlannedPick('gp1', 'r1', 't-home')).toEqual({
			submitted: false,
			reason: 'already-picked',
		})
		// The plan stays put — same as the sequential already-picked path.
		expect(db.delete).not.toHaveBeenCalled()
	})

	it('reports already-picked without inserting when a pick already exists', async () => {
		vi.mocked(db.query.pick.findFirst).mockResolvedValue({ id: 'existing' } as never)

		expect(await submitPlannedPick('gp1', 'r1', 't-home')).toEqual({
			submitted: false,
			reason: 'already-picked',
		})
		expect(db.insert).not.toHaveBeenCalled()
	})
})
