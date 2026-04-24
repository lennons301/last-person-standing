// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePayload } from '@/lib/live/types'
import { LiveProvider } from './live-provider'
import { useLiveGame } from './use-live-game'

function wrapperFor(gameId: string) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <LiveProvider gameId={gameId}>{children}</LiveProvider>
	}
}

function basePayload(overrides: Partial<LivePayload> = {}): LivePayload {
	return {
		gameId: 'g1',
		gameMode: 'classic',
		roundId: 'r1',
		fixtures: [],
		picks: [],
		players: [],
		viewerUserId: 'u1',
		updatedAt: new Date().toISOString(),
		...overrides,
	}
}

describe('useLiveGame', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('fetches immediately on mount and returns payload', async () => {
		const payload = basePayload()
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => payload,
		})
		const { result, unmount } = renderHook(() => useLiveGame(), { wrapper: wrapperFor('g1') })
		await waitFor(() => expect(result.current.payload).not.toBeNull())
		expect(result.current.payload?.gameId).toBe('g1')
		unmount()
	})

	it('sets isStale on fetch failure', async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'))
		const { result, unmount } = renderHook(() => useLiveGame(), { wrapper: wrapperFor('g1') })
		await waitFor(() => expect(result.current.isStale).toBe(true))
		unmount()
	})
})
