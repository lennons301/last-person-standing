import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const { getGameDetailMock, getShareWinnerDataMock, ImageResponseMock } = vi.hoisted(() => {
	class ImageResponseMock extends Response {
		constructor(_jsx: unknown, _options: unknown) {
			super('png-bytes', { status: 200 })
		}
	}
	return {
		getGameDetailMock: vi.fn(),
		getShareWinnerDataMock: vi.fn(),
		ImageResponseMock,
	}
})
vi.mock('@/lib/game/detail-queries', () => ({ getGameDetail: getGameDetailMock }))
vi.mock('@/lib/share/data', () => ({ getShareWinnerData: getShareWinnerDataMock }))
vi.mock('next/og', () => ({
	ImageResponse: ImageResponseMock,
}))

import { GET } from './route'

const ctx = { params: Promise.resolve({ gameId: 'g1' }) }

describe('winner route', () => {
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
		getShareWinnerDataMock.mockResolvedValue({
			mode: 'classic',
			header: {
				gameName: 'Test',
				gameMode: 'classic',
				competitionName: 'WC',
				pot: '0',
				potTotal: '0',
				generatedAt: new Date('2026-04-27T00:00:00Z'),
			},
			winners: [],
			runnersUp: [],
			overflowCount: 0,
		})
		const res = await GET(new Request('http://x'), ctx)
		expect(res.status).toBe(200)
	})
})
