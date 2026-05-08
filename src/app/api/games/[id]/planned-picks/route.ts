import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import {
	type PastPick,
	type PlannedPick as PPick,
	validatePlannedPick,
} from '@/lib/game/planned-picks'
import { scheduleAutoSubmitForPlan } from '@/lib/game/round-lifecycle'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer, pick, plannedPick } from '@/lib/schema/game'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params

	const membership = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
	})
	if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

	const plans = await db.query.plannedPick.findMany({
		where: eq(plannedPick.gamePlayerId, membership.id),
	})
	return NextResponse.json({ plans })
}

interface PostBody {
	roundId: string
	teamId: string
	autoSubmit: boolean
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params
	const body = (await request.json()) as PostBody

	const [membership, g, r] = await Promise.all([
		db.query.gamePlayer.findFirst({
			where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
		}),
		db.query.game.findFirst({ where: eq(game.id, gameId) }),
		db.query.round.findFirst({ where: eq(round.id, body.roundId) }),
	])
	if (!membership || !g || !r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (g.gameMode !== 'classic') {
		return NextResponse.json({ error: 'planner is classic-only' }, { status: 400 })
	}
	if (r.status !== 'upcoming') {
		return NextResponse.json({ error: 'cannot plan for a started round' }, { status: 400 })
	}

	// Load this player's past picks and existing plans with their round numbers
	const [pastPickRows, planRows] = await Promise.all([
		db.query.pick.findMany({
			where: eq(pick.gamePlayerId, membership.id),
			with: { round: true },
		}),
		db.query.plannedPick.findMany({
			where: eq(plannedPick.gamePlayerId, membership.id),
			with: { round: true },
		}),
	])
	const pastPicks: PastPick[] = pastPickRows.map((p) => ({
		roundNumber: p.round.number,
		teamId: p.teamId,
	}))
	const plannedPicks: PPick[] = planRows.map((p) => ({
		roundNumber: p.round.number,
		teamId: p.teamId,
	}))

	const result = validatePlannedPick({
		teamId: body.teamId,
		roundNumber: r.number,
		pastPicks,
		plannedPicks,
	})
	if (!result.valid) {
		return NextResponse.json(
			{ error: result.reason, roundNumber: result.roundNumber },
			{ status: 400 },
		)
	}

	// Upsert: delete existing plan for this (player, round) and insert new
	await db
		.delete(plannedPick)
		.where(and(eq(plannedPick.gamePlayerId, membership.id), eq(plannedPick.roundId, body.roundId)))
	const [created] = await db
		.insert(plannedPick)
		.values({
			gamePlayerId: membership.id,
			roundId: body.roundId,
			teamId: body.teamId,
			autoSubmit: body.autoSubmit,
		})
		.returning()

	// If the player wants this auto-submitted, enqueue the QStash trigger
	// for T-60s before the round's deadline. Idempotent via dedup ID, so
	// re-saves of the same plan don't duplicate the schedule.
	if (body.autoSubmit) {
		await scheduleAutoSubmitForPlan(membership.id, body.roundId, body.teamId)
	}

	return NextResponse.json({ plan: created })
}
