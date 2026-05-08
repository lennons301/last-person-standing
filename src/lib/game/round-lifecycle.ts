import { eq } from 'drizzle-orm'
import { enqueueAutoSubmit } from '@/lib/data/qstash'
import { db } from '@/lib/db'
import { round } from '@/lib/schema/competition'
import { plannedPick } from '@/lib/schema/game'

const AUTO_SUBMIT_LEAD_MS = 60_000

/**
 * A round transitions from 'upcoming' → 'open' when a game starts using it
 * (game creation OR advance after a previous round finishes). Bootstrap no
 * longer drives this transition based on wall-clock time — that was a
 * regression from the predecessor app.
 *
 * Idempotent: safe to call repeatedly; status flip is a no-op if already
 * 'open' or beyond, and auto-submit enqueues use QStash dedup IDs.
 */
export async function openRoundForGame(roundId: string): Promise<void> {
	const r = await db.query.round.findFirst({ where: eq(round.id, roundId) })
	if (!r) return
	if (r.status === 'upcoming') {
		await db.update(round).set({ status: 'open' }).where(eq(round.id, roundId))
	}
	await scheduleAutoSubmitsForRound(roundId)
}

/**
 * Find all auto-submit-marked planned picks for a round and enqueue their
 * QStash triggers for T-60s before the deadline. Idempotent via dedup IDs.
 */
export async function scheduleAutoSubmitsForRound(roundId: string): Promise<void> {
	const r = await db.query.round.findFirst({ where: eq(round.id, roundId) })
	if (!r?.deadline) return
	const plans = await db.query.plannedPick.findMany({ where: eq(plannedPick.roundId, roundId) })
	const autoPlans = plans.filter((p) => p.autoSubmit)
	if (autoPlans.length === 0) return
	const notBefore = new Date(r.deadline.getTime() - AUTO_SUBMIT_LEAD_MS)
	if (notBefore.getTime() <= Date.now()) return // deadline already very close or past
	for (const p of autoPlans) {
		await enqueueAutoSubmit(p.gamePlayerId, p.roundId, p.teamId, notBefore)
	}
}

/**
 * Schedule auto-submit for a single just-created/updated plan.
 */
export async function scheduleAutoSubmitForPlan(
	gamePlayerId: string,
	roundId: string,
	teamId: string,
): Promise<void> {
	const r = await db.query.round.findFirst({ where: eq(round.id, roundId) })
	if (!r?.deadline) return
	const notBefore = new Date(r.deadline.getTime() - AUTO_SUBMIT_LEAD_MS)
	if (notBefore.getTime() <= Date.now()) return
	await enqueueAutoSubmit(gamePlayerId, roundId, teamId, notBefore)
}
