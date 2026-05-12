import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getGameDetailMock, getLivePayloadMock, reconcileMock } = vi.hoisted(() => ({
	getGameDetailMock: vi.fn(),
	getLivePayloadMock: vi.fn(),
	reconcileMock: vi.fn().mockResolvedValue({ ok: true, action: 'noop', reason: 'test' }),
}))

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

vi.mock('@/lib/game/detail-queries', () => ({
	getGameDetail: getGameDetailMock,
	getLivePayload: getLivePayloadMock,
}))

vi.mock('@/lib/game/reconcile', () => ({
	reconcileGameState: reconcileMock,
}))

import { GET } from './route'

function req(url: string): Request {
	return new Request(url)
}

describe('GET /api/games/[id]/live', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns 404 when the game does not exist', async () => {
		getGameDetailMock.mockResolvedValue(null)
		const res = await GET(req('http://x/api/games/g1/live'), {
			params: Promise.resolve({ id: 'g1' }),
		})
		expect(res.status).toBe(404)
	})

	it('returns 403 when the user is not a member', async () => {
		getGameDetailMock.mockResolvedValue({ isMember: false })
		const res = await GET(req('http://x/api/games/g1/live'), {
			params: Promise.resolve({ id: 'g1' }),
		})
		expect(res.status).toBe(403)
	})

	it('returns the live payload', async () => {
		getGameDetailMock.mockResolvedValue({ isMember: true, gameMode: 'classic' })
		getLivePayloadMock.mockResolvedValue({ players: [], updatedAt: new Date().toISOString() })
		const res = await GET(req('http://x/api/games/g1/live'), {
			params: Promise.resolve({ id: 'g1' }),
		})
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body).toHaveProperty('players')
		expect(body).toHaveProperty('updatedAt')
	})
})
