import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncCompetition } from '@/lib/game/bootstrap-competitions'
import { competition } from '@/lib/schema/competition'

export async function POST(request: Request) {
	const secret = process.env.CRON_SECRET
	if (!secret) {
		return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
	}
	if (request.headers.get('authorization') !== `Bearer ${secret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	const comps = await db.query.competition.findMany({
		where: eq(competition.status, 'active'),
	})
	const results = []
	for (const c of comps) {
		const summary = await syncCompetition(c, { footballDataApiKey: apiKey })
		results.push({ competitionId: c.id, ...summary })
	}
	return NextResponse.json({ competitions: results })
}
