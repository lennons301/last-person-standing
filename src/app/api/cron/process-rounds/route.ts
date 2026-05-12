import { NextResponse } from 'next/server'
import { reconcileAllActiveGames } from '@/lib/game/reconcile'

/**
 * Manual safety-net for ops debugging. Production reconciliation runs on
 * every game-page view + every /api/games/[id]/live poll + daily-sync;
 * this endpoint is just a fast way to kick the same logic from a shell.
 */
export async function POST(request: Request) {
	const secret = process.env.CRON_SECRET
	if (!secret) {
		return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
	}
	if (request.headers.get('authorization') !== `Bearer ${secret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}
	const summary = await reconcileAllActiveGames()
	return NextResponse.json(summary)
}
