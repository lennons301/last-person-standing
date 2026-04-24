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
})
