import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const { getGameDetailMock, getShareLiveDataMock } = vi.hoisted(() => ({
	getGameDetailMock: vi.fn(),
	getShareLiveDataMock: vi.fn(),
}))
vi.mock('@/lib/game/detail-queries', () => ({ getGameDetail: getGameDetailMock }))
vi.mock('@/lib/share/data', () => ({ getShareLiveData: getShareLiveDataMock }))

vi.mock('next/og', () => ({
	ImageResponse: vi.fn().mockImplementation(() => new Response('png-bytes', { status: 200 })),
}))

import { GET } from './route'

const ctx = { params: Promise.resolve({ gameId: 'g1' }) }

describe('live route', () => {
	beforeEach(() => vi.clearAllMocks())

	it('404s when game is missing', async () => {
		getGameDetailMock.mockResolvedValue(null)
		const res = await GET(new Request('http://x'), ctx)
		expect(res.status).toBe(404)
	})

	it('403s when caller is not a member', async () => {
		getGameDetailMock.mockResolvedValue({ isMember: false })
		const res = await GET(new Request('http://x'), ctx)
		expect(res.status).toBe(403)
	})

	it('200s on happy path', async () => {
		getGameDetailMock.mockResolvedValue({ isMember: true })
		getShareLiveDataMock.mockResolvedValue({
			mode: 'classic',
			header: {
				gameName: 'Test',
				gameMode: 'classic',
				competitionName: 'WC',
				pot: '0',
				potTotal: '0',
				generatedAt: new Date('2026-04-27T00:00:00Z'),
			},
			rows: [],
			roundNumber: 1,
		})
		const res = await GET(new Request('http://x'), ctx)
		expect(res.status).toBe(200)
	})
})
