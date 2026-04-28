'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

interface RebuyBannerProps {
	gameId: string
	entryFee: string
	round2Deadline: Date
	/** If set, the user has a pending rebuy payment awaiting claim. */
	pendingPayment: { id: string; amount: string } | null
}

export function RebuyBanner({
	gameId,
	entryFee,
	round2Deadline,
	pendingPayment,
}: RebuyBannerProps) {
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

	const deadlineStr = round2Deadline.toLocaleString('en-GB', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	})

	if (pendingPayment) {
		return (
			<div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
				<div className="font-display text-sm font-semibold text-amber-900">
					Rebuy payment pending
				</div>
				<p className="mt-1 text-xs text-amber-800">
					Mark as paid once you've transferred £{pendingPayment.amount}. You're back in as soon as
					the payment is claimed.
				</p>
				<button
					type="button"
					onClick={() => claimPaid(pendingPayment.id)}
					disabled={loading}
					className="mt-2 rounded bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					{loading ? 'Working…' : 'Claim paid'}
				</button>
			</div>
		)
	}

	return (
		<div className="rounded-xl border border-[var(--eliminated-border)] bg-[var(--eliminated-bg)] p-4">
			<div className="font-display text-sm font-semibold text-foreground">
				You're out of round 1 — buy back in for £{entryFee}
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				Rebuys close at the round 2 deadline ({deadlineStr}).
			</p>
			<button
				type="button"
				onClick={startRebuy}
				disabled={loading}
				className="mt-2 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				{loading ? 'Working…' : `Rebuy £${entryFee}`}
			</button>
		</div>
	)
}
