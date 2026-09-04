import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireMembershipMock, getLivePayloadMock, reconcileMock } = vi.hoisted(() => ({
	requireMembershipMock: vi.fn(),
	getLivePayloadMock: vi.fn(),
	reconcileMock: vi.fn().mockResolvedValue({ ok: true, action: 'noop', reason: 'test' }),
}))

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

vi.mock('@/lib/game/read/live', () => ({
	getLivePayload: getLivePayloadMock,
}))

vi.mock('@/lib/game/membership', () => ({
	requireMembership: requireMembershipMock,
}))

vi.mock('@/lib/game/reconcile', () => ({
	reconcileGameState: reconcileMock,
}))

import { GET } from './route'

// Authorization is the seam's call now; the route renders what it decided.
const NOT_FOUND = { ok: false, reason: 'not-found', status: 404, message: 'Not found' }
const NOT_MEMBER = { ok: false, reason: 'not-member', status: 403, message: 'Forbidden' }
const MEMBER = { ok: true, membership: { id: 'gp1' } }

function req(url: string): Request {
	return new Request(url)
}

describe('GET /api/games/[id]/live', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns 404 when the game does not exist', async () => {
		requireMembershipMock.mockResolvedValue(NOT_FOUND)
		const res = await GET(req('http://x/api/games/g1/live'), {
			params: Promise.resolve({ id: 'g1' }),
		})
		expect(res.status).toBe(404)
	})

	it('returns 403 when the user is not a member', async () => {
		requireMembershipMock.mockResolvedValue(NOT_MEMBER)
		const res = await GET(req('http://x/api/games/g1/live'), {
			params: Promise.resolve({ id: 'g1' }),
		})
		expect(res.status).toBe(403)
	})

	it('returns the live payload', async () => {
		requireMembershipMock.mockResolvedValue(MEMBER)
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
