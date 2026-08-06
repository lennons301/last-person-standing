'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { LocalDateTime } from '@/components/local-datetime'
import { Button } from '@/components/ui/button'
import { PayLinkButton } from './pay-link-button'

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
	creatorName: string
	/**
	 * Pre-filled link to pay the creator the rebuy amount, or null when they've
	 * saved no handle — then the rebuy is settled out-of-band as it is today.
	 */
	payUrl?: string | null
	size?: 'sm' | 'default' | 'lg'
}

export function RebuyActions({
	gameId,
	entryFee,
	pendingPayment,
	creatorName,
	payUrl = null,
	size = 'sm',
}: RebuyActionsProps) {
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
			<div className="flex flex-wrap items-center gap-2">
				<PayLinkButton url={payUrl} creatorName={creatorName} amount={pendingPayment.amount} />
				<Button
					type="button"
					size={size}
					variant={payUrl ? 'outline' : 'default'}
					onClick={() => claimPaid(pendingPayment.id)}
					disabled={loading}
				>
					{loading ? 'Working…' : 'Claim paid'}
				</Button>
			</div>
		)
	}

	return (
		<Button type="button" size={size} onClick={startRebuy} disabled={loading}>
			{loading ? 'Working…' : `Rebuy £${entryFee}`}
		</Button>
	)
}

/**
 * Fallback for the viewer's own standing rebuy offer when the hero isn't theirs
 * to speak for — an admin acting as another player sees the target's lens, and
 * `game.rebuyBanner` is derived from their *own* membership. Without this the
 * offer would silently vanish from the page for as long as `?actingAs=` is set.
 */
export function RebuyOfferNotice({
	gameId,
	entryFee,
	round2Deadline,
	creatorName,
}: {
	gameId: string
	entryFee: string
	round2Deadline: Date
	creatorName: string
}) {
	return (
		<div className="flex items-start gap-3 rounded-lg border border-[var(--draw)]/50 bg-card p-3">
			<span className="text-lg text-[var(--draw)]">↺</span>
			<div className="flex-1">
				<h4 className="text-xs font-bold">You can buy back in</h4>
				<p className="mt-0.5 text-[11px] text-muted-foreground">
					You went out in round 1. One rebuy is on offer — it closes{' '}
					<LocalDateTime date={round2Deadline} />.
				</p>
			</div>
			<RebuyActions
				gameId={gameId}
				entryFee={entryFee}
				pendingPayment={null}
				creatorName={creatorName}
			/>
		</div>
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
	creatorName,
	payUrl = null,
}: {
	gameId: string
	entryFee: string
	pendingPayment: { id: string; amount: string }
	creatorName: string
	payUrl?: string | null
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
			<RebuyActions
				gameId={gameId}
				entryFee={entryFee}
				pendingPayment={pendingPayment}
				creatorName={creatorName}
				payUrl={payUrl}
			/>
		</div>
	)
}
