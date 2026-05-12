import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail, getLivePayload } from '@/lib/game/detail-queries'
import { reconcileGameState } from '@/lib/game/reconcile'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: RouteCtx): Promise<Response> {
	const session = await requireSession()
	const { id } = await ctx.params

	const game = await getGameDetail(id, session.user.id)
	if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (!game.isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

	// Browser polls this every 30 s while a game page is open. Use those
	// hits as a recovery surface — settles any finished-but-pending picks
	// before computing the payload so the user sees consistent state.
	// Per-fixture settlement on poll-scores is still the fast path; this
	// is a safety net.
	await reconcileGameState(id)

	const payload = await getLivePayload(id, session.user.id)
	if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

	return NextResponse.json(payload, {
		headers: { 'Cache-Control': 'no-store' },
	})
}
