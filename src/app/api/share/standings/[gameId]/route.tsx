import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail } from '@/lib/game/detail-queries'
import { getShareStandingsData } from '@/lib/share/data'
import { classicStandingsLayout } from '@/lib/share/layouts/classic-standings'
import { cupStandingsLayout } from '@/lib/share/layouts/cup-standings'
import { turboStandingsLayout } from '@/lib/share/layouts/turbo-standings'

export const runtime = 'nodejs'

const CACHE_HEADERS = {
	'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
}

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
	const session = await requireSession()
	const { gameId } = await params

	const game = await getGameDetail(gameId, session.user.id)
	if (!game) return new Response('Not found', { status: 404 })
	if (!game.isMember) return new Response('Forbidden', { status: 403 })

	const data = await getShareStandingsData(gameId, session.user.id)
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
