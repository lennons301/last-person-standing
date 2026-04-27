import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail } from '@/lib/game/detail-queries'
import { getShareLiveData } from '@/lib/share/data'
import { classicLiveLayout } from '@/lib/share/layouts/classic-live'
import { cupLiveLayout } from '@/lib/share/layouts/cup-live'
import { turboLiveLayout } from '@/lib/share/layouts/turbo-live'

export const runtime = 'nodejs'

const CACHE_HEADERS = { 'Cache-Control': 'no-store' }

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
	const session = await requireSession()
	const { gameId } = await params
	const game = await getGameDetail(gameId, session.user.id)
	if (!game) return new Response('Not found', { status: 404 })
	if (!game.isMember) return new Response('Forbidden', { status: 403 })

	const data = await getShareLiveData(gameId, session.user.id)
	if (!data) return new Response('No data', { status: 404 })

	const layout =
		data.mode === 'classic'
			? classicLiveLayout(data)
			: data.mode === 'cup'
				? cupLiveLayout(data)
				: turboLiveLayout(data)

	return new ImageResponse(layout.jsx, {
		width: layout.width,
		height: layout.height,
		headers: CACHE_HEADERS,
	})
}
