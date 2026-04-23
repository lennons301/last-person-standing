'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface MyPaymentStripProps {
	gameId: string
	status: 'pending' | 'claimed' | 'paid' | 'refunded'
	amount: string
	creatorName: string
	onClaimed?: () => void
}

export function MyPaymentStrip({
	gameId,
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
			})
			if (!res.ok) throw new Error(String(res.status))
			toast.success('Marked as paid — waiting for admin confirmation')
			onClaimed?.()
		} catch {
			toast.error('Failed to mark as paid')
		} finally {
			setPending(false)
		}
	}

	return (
		<div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-2.5">
			<div className="flex items-center gap-3">
				<span className="text-sm text-muted-foreground">Your entry fee</span>
				<StatusChip status={status} />
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

function StatusChip({ status }: { status: MyPaymentStripProps['status'] }) {
	const styles = {
		pending: 'bg-muted text-foreground/70',
		claimed: 'bg-amber-100 text-amber-900',
		paid: 'bg-emerald-100 text-emerald-900',
		refunded: 'bg-muted text-foreground/70',
	}[status]
	const label = {
		pending: 'UNPAID',
		claimed: '⏱ AWAITING CONFIRMATION',
		paid: '✓ PAID',
		refunded: 'REFUNDED',
	}[status]
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
				styles,
			)}
		>
			{label}
		</span>
	)
}
