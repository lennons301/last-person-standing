import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: {
		select: vi.fn(),
	},
}))

import { db } from '@/lib/db'
import { requireMembership } from './membership'

/** The one row shape the left join yields: the game, with its membership or null. */
function rows(result: Array<{ membership: unknown }>) {
	const limit = vi.fn().mockResolvedValue(result)
	vi.mocked(db.select).mockReturnValue({
		from: vi.fn().mockReturnValue({
			leftJoin: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({ limit }),
			}),
		}),
	} as never)
	return { limit }
}

const membershipRow = {
	id: 'gp1',
	gameId: 'g1',
	userId: 'u1',
	status: 'alive',
	eliminatedRoundId: null,
	eliminatedReason: null,
	livesRemaining: 0,
	joinedAt: new Date(),
}

describe('requireMembership', () => {
	beforeEach(() => vi.clearAllMocks())

	it('returns the membership row for a player in the game', async () => {
		rows([{ membership: membershipRow }])
		const result = await requireMembership('g1', 'u1')
		expect(result).toEqual({ ok: true, membership: membershipRow })
	})

	it('answers 404 when no such game exists', async () => {
		rows([])
		expect(await requireMembership('g1', 'u1')).toEqual({
			ok: false,
			reason: 'not-found',
			status: 404,
			message: 'Not found',
		})
	})

	// The game exists but the caller is a stranger to it — distinct from 404 on
	// purpose, which is the whole reason the lookup joins rather than reading
	// `game_player` alone.
	it('answers 403 when the game exists and the caller is not in it', async () => {
		rows([{ membership: null }])
		expect(await requireMembership('g1', 'u2')).toMatchObject({
			ok: false,
			reason: 'not-member',
			status: 403,
		})
	})

	// The creator took them out and refunded them; `activeField` drops them from
	// every surface, and `getGameDetail.isMember` read them as non-members too.
	it('answers 403 for an admin-removed player', async () => {
		rows([
			{ membership: { ...membershipRow, status: 'eliminated', eliminatedReason: 'admin_removed' } },
		])
		expect(await requireMembership('g1', 'u1')).toMatchObject({ ok: false, reason: 'not-member' })
	})

	// One lookup is the point of the seam (#246) — the routes reading it are on
	// a 30-second poll.
	it('makes exactly one query', async () => {
		rows([{ membership: membershipRow }])
		await requireMembership('g1', 'u1')
		expect(db.select).toHaveBeenCalledTimes(1)
	})
})
