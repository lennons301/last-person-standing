import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail, getLivePayload } from '@/lib/game/detail-queries'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: RouteCtx): Promise<Response> {
	const session = await requireSession()
	const { id } = await ctx.params

	const game = await getGameDetail(id, session.user.id)
	if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (!game.isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

	const payload = await getLivePayload(id, session.user.id)
	if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

	return NextResponse.json(payload, {
		headers: { 'Cache-Control': 'no-store' },
	})
}
