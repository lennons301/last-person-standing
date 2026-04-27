import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
	db: {
		select: vi.fn(),
	},
}))

import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { GET } from './route'

describe('GET /api/users/search', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u-me' } } as never)
	})

	it('returns [] for empty query', async () => {
		const req = new Request('http://localhost/api/users/search?q=')
		const res = await GET(req)
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ users: [] })
	})

	it('returns matching users limited to 10', async () => {
		const mockUsers = Array.from({ length: 15 }, (_, i) => ({
			id: `u-${i}`,
			name: `User ${i}`,
			email: `u${i}@example.com`,
		}))
		const selectChain = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(mockUsers.slice(0, 10)),
				}),
			}),
		}
		vi.mocked(db.select).mockReturnValue(selectChain as never)

		const req = new Request('http://localhost/api/users/search?q=user')
		const res = await GET(req)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.users).toHaveLength(10)
	})

	it('marks results as isInGame when ?gameId= matches an existing game_player', async () => {
		const mockUsers = [
			{ id: 'u1', name: 'Sean', email: 's@x.com' },
			{ id: 'u2', name: 'Sarah', email: 'sa@x.com' },
		]
		const userSelectChain = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(mockUsers),
				}),
			}),
		}
		const playerSelectChain = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([{ userId: 'u1' }]),
			}),
		}

		let callCount = 0
		vi.mocked(db.select).mockImplementation(() => {
			callCount++
			return callCount === 1 ? (userSelectChain as never) : (playerSelectChain as never)
		})

		const req = new Request('http://localhost/api/users/search?q=s&gameId=g1')
		const res = await GET(req)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.users).toEqual([
			{ id: 'u1', name: 'Sean', email: 's@x.com', isInGame: true },
			{ id: 'u2', name: 'Sarah', email: 'sa@x.com', isInGame: false },
		])
	})

	it('returns un-augmented results when ?gameId= is not provided', async () => {
		const mockUsers = [{ id: 'u1', name: 'Sean', email: 's@x.com' }]
		const selectChain = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(mockUsers),
				}),
			}),
		}
		vi.mocked(db.select).mockReturnValue(selectChain as never)

		const req = new Request('http://localhost/api/users/search?q=sean')
		const res = await GET(req)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.users[0].isInGame).toBeUndefined()
	})
})
