import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import type { GridSort, GridSortKey } from '@/lib/game/grid-sort'
import { requireMembership } from '@/lib/game/membership'
import { getShareStandingsData } from '@/lib/share/data'
import { classicStandingsLayout } from '@/lib/share/layouts/classic-standings'
import { cupStandingsLayout } from '@/lib/share/layouts/cup-standings'
import { turboStandingsLayout } from '@/lib/share/layouts/turbo-standings'

export const runtime = 'nodejs'

const CACHE_HEADERS = {
	'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
}

const SORT_KEYS = new Set<GridSortKey>(['name', 'goals', 'status', 'round'])

/** Parse the grid's sort/filter state off the share URL (mirrors ProgressGrid). */
function parseSort(sp: URLSearchParams): GridSort | undefined {
	const key = sp.get('sort')
	if (!key || !SORT_KEYS.has(key as GridSortKey)) return undefined
	const dir = sp.get('dir') === 'desc' ? 'desc' : 'asc'
	const roundId = sp.get('round') ?? undefined
	// A round sort without a target round is meaningless — fall back to default.
	if (key === 'round' && !roundId) return undefined
	return { key: key as GridSortKey, roundId, dir }
}

export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
	const session = await requireSession()
	const { gameId } = await params

	const access = await requireMembership(gameId, session.user.id)
	if (!access.ok) return new Response(access.message, { status: access.status })

	const sp = new URL(request.url).searchParams
	const data = await getShareStandingsData(gameId, session.user.id, {
		sort: parseSort(sp),
		aliveOnly: sp.get('aliveOnly') === '1',
	})
	if (!data) return new Response('No data', { status: 404 })

	const layout =
		data.mode === 'classic'
			? classicStandingsLayout(data)
			: data.mode === 'cup'
				? cupStandingsLayout(data)
				: turboStandingsLayout(data)

	return new ImageResponse(layout.jsx, {
		width: layout.width,
		height: layout.height,
		headers: CACHE_HEADERS,
	})
}
