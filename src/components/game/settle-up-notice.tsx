'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { type PaymentStatus, PaymentStatusChip } from './payment-status-chip'

interface SettleUpNoticeProps {
	gameId: string
	paymentId: string
	status: PaymentStatus
	amount: string
	creatorName: string
	onClaimed?: () => void
}

/**
 * The viewer's own outstanding entry money, as a quiet aside on the stat line
 * rather than a full-width band across the page. Tapping it opens the settle-up
 * detail — how much, to whom, and the "mark as paid" claim — which is also where
 * the entry fee itself now surfaces for a player who owes it.
 */
export function SettleUpNotice({
	gameId,
	paymentId,
	status,
	amount,
	creatorName,
	onClaimed,
}: SettleUpNoticeProps) {
	const [open, setOpen] = useState(false)
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
			setOpen(false)
			onClaimed?.()
		} catch {
			toast.error('Failed to mark as paid')
		} finally {
			setPending(false)
		}
	}

	return (
		<>
			<UnpaidNotice amount={amount} status={status} onClick={() => setOpen(true)} />

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Settle up</DialogTitle>
						<DialogDescription>
							Your entry fee for this game is collected by the organiser, outside the app.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
							<span className="text-muted-foreground">Entry fee</span>
							<span className="font-display font-semibold">£{amount}</span>
						</div>
						<div className="flex items-center justify-between gap-3 text-sm">
							<span className="text-muted-foreground">Owed to {creatorName}</span>
							<PaymentStatusChip status={status} />
						</div>
						{status === 'pending' && (
							<Button className="w-full" disabled={pending} onClick={handleClaim}>
								{pending ? 'Saving…' : "I've paid — mark as paid"}
							</Button>
						)}
						{status === 'claimed' && (
							<p className="text-xs text-muted-foreground">
								Waiting for {creatorName} to confirm they've received it.
							</p>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

/**
 * The presentational half — the line's quiet aside, with no claim wiring. Split
 * out so the preview gallery can render it without a payment row behind it.
 */
export function UnpaidNotice({
	amount,
	status,
	onClick,
}: {
	amount: string
	status: PaymentStatus
	onClick?: () => void
}) {
	return (
		<>
			<span aria-hidden>·</span>
			<button
				type="button"
				onClick={onClick}
				className="inline-flex items-center gap-1 rounded text-[var(--draw)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<span className="font-semibold">
					£{amount} {status === 'claimed' ? 'awaiting confirmation' : 'unpaid'}
				</span>
				<span>— settle up</span>
			</button>
		</>
	)
}
