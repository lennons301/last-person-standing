import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { requireMembership } from '@/lib/game/membership'
import { getShareWinnerData } from '@/lib/share/data'
import { classicWinnerLayout } from '@/lib/share/layouts/classic-winner'
import { cupWinnerLayout } from '@/lib/share/layouts/cup-winner'
import { turboWinnerLayout } from '@/lib/share/layouts/turbo-winner'

export const runtime = 'nodejs'

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, immutable' }

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
	const session = await requireSession()
	const { gameId } = await params
	const access = await requireMembership(gameId, session.user.id)
	if (!access.ok) return new Response(access.message, { status: access.status })

	const data = await getShareWinnerData(gameId, session.user.id)
	if (!data) return new Response('No data', { status: 404 })

	const layout =
		data.mode === 'classic'
			? classicWinnerLayout(data)
			: data.mode === 'cup'
				? cupWinnerLayout(data)
				: turboWinnerLayout(data)

	return new ImageResponse(layout.jsx, {
		width: layout.width,
		height: layout.height,
		headers: CACHE_HEADERS,
	})
}
