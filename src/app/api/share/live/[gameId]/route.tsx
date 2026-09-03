import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { requireMembership } from '@/lib/game/membership'
import { getShareLiveData } from '@/lib/share/data'
import { classicLiveLayout } from '@/lib/share/layouts/classic-live'
import { cupLiveLayout } from '@/lib/share/layouts/cup-live'
import { turboLiveLayout } from '@/lib/share/layouts/turbo-live'

export const runtime = 'nodejs'

const CACHE_HEADERS = { 'Cache-Control': 'no-store' }

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
	const session = await requireSession()
	const { gameId } = await params
	const access = await requireMembership(gameId, session.user.id)
	if (!access.ok) return new Response(access.message, { status: access.status })

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
