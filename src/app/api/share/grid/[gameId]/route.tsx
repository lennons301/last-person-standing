import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail } from '@/lib/game/detail-queries'
import { getShareStandingsData } from '@/lib/share/data'
import { classicStandingsLayout } from '@/lib/share/layouts/classic-standings'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
	const session = await requireSession()
	const { gameId } = await params

	const game = await getGameDetail(gameId, session.user.id)
	if (!game) return new Response('Not found', { status: 404 })
	if (!game.isMember) return new Response('Forbidden', { status: 403 })

	const data = await getShareStandingsData(gameId, session.user.id)
	if (!data) return new Response('No data', { status: 404 })
	if (data.mode !== 'classic') {
		// Legacy /grid is classic-only; cup/turbo callers should use /standings (added in Task 5).
		return new Response('Mode unsupported on legacy /grid; use /api/share/standings', {
			status: 400,
		})
	}
	const { jsx, width, height } = classicStandingsLayout(data)
	return new ImageResponse(jsx, { width, height })
}
