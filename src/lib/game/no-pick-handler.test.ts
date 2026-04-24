import { describe, expect, it, vi } from 'vitest'
import { processDeadlineLock } from './no-pick-handler'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			round: { findFirst: vi.fn().mockResolvedValue(undefined) },
			game: { findMany: vi.fn().mockResolvedValue([]) },
			pick: { findFirst: vi.fn(), findMany: vi.fn() },
			fixture: { findMany: vi.fn() },
			team: { findMany: vi.fn() },
			payment: { findFirst: vi.fn() },
		},
		insert: vi.fn(),
		update: vi.fn(),
	},
}))

describe('processDeadlineLock', () => {
	it('no-ops when no games use the round', async () => {
		const result = await processDeadlineLock(['r1'])
		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })
	})
})
