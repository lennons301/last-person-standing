import { eq } from 'drizzle-orm'
import { enqueueAutoSubmit, enqueueDeadlineLock } from '@/lib/data/qstash'
import { db } from '@/lib/db'
import { round } from '@/lib/schema/competition'
import { plannedPick } from '@/lib/schema/game'

const AUTO_SUBMIT_LEAD_MS = 60_000

/**
 * How long after the deadline the no-pick lock trigger fires. Orders it
 * safely after the T-60s auto-submits have landed and absorbs QStash/server
 * clock skew, so the lock never observes a not-quite-passed deadline (its
 * internal gate would turn an early firing into a silent no-op with no
 * retry until the daily-sync fallback).
 */
export const DEADLINE_LOCK_LAG_MS = 30_000

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
	await scheduleDeadlineLockForRound(roundId)
}

/**
 * Schedule the round's no-pick lock (processDeadlineLock via the QStash
 * handler) for just after the deadline. Returns the scheduled time, or null
 * when nothing was queued. Best-effort: a failed enqueue is logged, never
 * thrown — the daily-sync fallback and the settle-path crown guard both run
 * the same idempotent lock, so a missed trigger delays no-pick processing
 * but can never change its outcome.
 *
 * Also called by the qstash-handler when a deadline_lock job fires while the
 * round's deadline is still in the future (a sync moved it later after the
 * job was queued) — the re-enqueue keeps the trigger chained to the real
 * deadline. The dedup id is derived from the notBefore slot, so a moved
 * deadline produces a fresh id and QStash accepts the new message.
 */
export async function scheduleDeadlineLockForRound(roundId: string): Promise<Date | null> {
	const r = await db.query.round.findFirst({ where: eq(round.id, roundId) })
	if (!r?.deadline) return null
	const notBefore = new Date(r.deadline.getTime() + DEADLINE_LOCK_LAG_MS)
	// Deadline already passed (stale round being re-opened / healed, or the
	// trigger firing on time): the daily-sync fallback and crown guard own
	// anything outstanding; queueing a trigger now would just burn quota.
	if (notBefore.getTime() <= Date.now()) return null
	try {
		await enqueueDeadlineLock(roundId, notBefore)
		return notBefore
	} catch (err) {
		console.warn(`[round-lifecycle] failed to enqueue deadline lock for round ${roundId}`, err)
		return null
	}
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
