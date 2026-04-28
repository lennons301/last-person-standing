'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { type PaymentStatus, PaymentStatusChip } from './payment-status-chip'

interface MyPaymentStripProps {
	gameId: string
	paymentId: string
	status: PaymentStatus
	amount: string
	creatorName: string
	onClaimed?: () => void
}

export function MyPaymentStrip({
	gameId,
	paymentId,
	status,
	amount,
	creatorName,
	onClaimed,
}: MyPaymentStripProps) {
	const [pending, setPending] = useState(false)

	async function handleClaim() {
		setPending(true)
		try {
			const res = await fetch(`/api/games/${gameId}/payments/claim`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ paymentId }),
			})
			if (!res.ok) throw new Error(String(res.status))
			toast.success('Payment marked as paid')
			onClaimed?.()
		} catch {
			toast.error('Failed to mark as paid')
		} finally {
			setPending(false)
		}
	}

	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-2.5">
			<div className="flex items-center gap-3">
				<span className="text-sm text-muted-foreground">Your entry fee</span>
				<PaymentStatusChip status={status} />
			</div>
			<div className="flex items-center gap-2">
				<span className="text-[11px] text-muted-foreground">
					£{amount} owed to {creatorName}
				</span>
				{status === 'pending' && (
					<button
						type="button"
						className="rounded bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
						disabled={pending}
						onClick={handleClaim}
					>
						Mark as paid
					</button>
				)}
			</div>
		</div>
	)
}
