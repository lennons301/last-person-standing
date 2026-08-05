'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * The two rebuy actions — start a rebuy, or claim the payment for one already
 * started. Split out of the old standalone rebuy banner so the presentational
 * half can live in the game hero (`GameHero`'s `rebuy` variant) and the pending
 * notice, while the fetch + refresh behaviour stays in one place.
 */
export interface RebuyActionsProps {
	gameId: string
	entryFee: string
	/** If set, the user has a pending rebuy payment awaiting claim. */
	pendingPayment: { id: string; amount: string } | null
	size?: 'sm' | 'default' | 'lg'
}

export function RebuyActions({ gameId, entryFee, pendingPayment, size = 'sm' }: RebuyActionsProps) {
	const router = useRouter()
	const [loading, setLoading] = useState(false)

	async function startRebuy() {
		setLoading(true)
		const res = await fetch(`/api/games/${gameId}/payments/rebuy`, { method: 'POST' })
		setLoading(false)
		if (res.ok) {
			toast.success('Rebuy initiated — mark as paid once transferred')
			router.refresh()
		} else {
			const body = await res.json().catch(() => ({ error: 'failed' }))
			toast.error(`Rebuy failed: ${body.error ?? 'unknown'}`)
		}
	}

	async function claimPaid(paymentId: string) {
		setLoading(true)
		const res = await fetch(`/api/games/${gameId}/payments/claim`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ paymentId }),
		})
		setLoading(false)
		if (res.ok) {
			toast.success("You're back in!")
			router.refresh()
		} else {
			toast.error('Claim failed')
		}
	}

	if (pendingPayment) {
		return (
			<Button
				type="button"
				size={size}
				onClick={() => claimPaid(pendingPayment.id)}
				disabled={loading}
			>
				{loading ? 'Working…' : 'Claim paid'}
			</Button>
		)
	}

	return (
		<Button type="button" size={size} onClick={startRebuy} disabled={loading}>
			{loading ? 'Working…' : `Rebuy £${entryFee}`}
		</Button>
	)
}

/**
 * Quiet in-hero notice for a rebuy that's been started and is waiting on
 * payment. The player is alive again at this point, so their hero is a pick
 * state — this rides in the hero's notice slot rather than owning it.
 */
export function RebuyPendingNotice({
	gameId,
	entryFee,
	pendingPayment,
}: {
	gameId: string
	entryFee: string
	pendingPayment: { id: string; amount: string }
}) {
	return (
		<div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-card p-3">
			<span className="text-lg text-amber-500">⚠</span>
			<div className="flex-1">
				<h4 className="text-xs font-bold">Rebuy payment pending</h4>
				<p className="mt-0.5 text-[11px] text-muted-foreground">
					Mark as paid once you've transferred £{pendingPayment.amount}. You're back in as soon as
					the payment is claimed.
				</p>
			</div>
			<RebuyActions gameId={gameId} entryFee={entryFee} pendingPayment={pendingPayment} />
		</div>
	)
}
