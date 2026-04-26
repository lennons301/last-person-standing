'use client'

import { toast } from 'sonner'
import { PaymentReminderButton } from './payment-reminder'
import { type PaymentStatus, PaymentStatusChip } from './payment-status-chip'

export interface AdminPayment {
	id: string
	userId: string
	userName: string
	amount: string
	status: PaymentStatus
	isRebuy: boolean
	isRebuyEligible: boolean
	claimedAt: Date | null
	paidAt: Date | null
}

interface PaymentsPanelProps {
	gameId: string
	gameName: string
	inviteCode: string
	totals: { confirmed: string; pending: string; total: string }
	payments: AdminPayment[]
	onChange?: () => void
}

export function PaymentsPanel(props: PaymentsPanelProps) {
	const all = props.payments
	const unpaidCount = all.filter((p) => p.status === 'pending').length

	async function callAction(p: AdminPayment, action: 'dispute' | 'admin-rebuy') {
		if (action === 'admin-rebuy') {
			const res = await fetch(`/api/games/${props.gameId}/admin/rebuy/${p.userId}`, {
				method: 'POST',
			})
			if (res.ok) {
				toast.success('Player reactivated — rebuy payment created as pending')
				props.onChange?.()
			} else {
				toast.error('Rebuy failed')
			}
			return
		}
		// 'dispute' branch — POSTs to .../{paymentId}/reject
		const res = await fetch(`/api/games/${props.gameId}/payments/${p.id}/reject`, {
			method: 'POST',
		})
		if (res.ok) {
			toast.success('Payment disputed')
			props.onChange?.()
		} else {
			toast.error('Action failed')
		}
	}

	return (
		<section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
			<div className="flex items-start justify-between">
				<div>
					<h2 className="font-display text-lg font-semibold">Payments</h2>
					<div className="text-[11px] text-muted-foreground">{unpaidCount} unpaid</div>
				</div>
				<div className="text-right">
					<div className="text-[10px] uppercase text-muted-foreground">Received total</div>
					<div className="font-display text-lg font-bold">£{props.totals.confirmed}</div>
					{props.totals.pending !== '0.00' && (
						<div className="text-[10px] text-amber-800">
							+£{props.totals.pending} awaiting confirmation
						</div>
					)}
				</div>
			</div>

			<div>
				<div className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
					All payments
				</div>
				{all.map((p) => (
					<Row
						key={`${p.userId}-all-${p.isRebuy ? 'rebuy' : 'original'}`}
						p={p}
						actions={
							<div className="flex gap-1">
								{p.isRebuyEligible && (
									<button
										type="button"
										onClick={() => callAction(p, 'admin-rebuy')}
										className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
									>
										Rebuy player
									</button>
								)}
								{p.status === 'paid' ? (
									<button
										type="button"
										onClick={() => callAction(p, 'dispute')}
										className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700"
									>
										Dispute
									</button>
								) : p.status === 'pending' ? (
									<PaymentReminderButton
										gameName={props.gameName}
										amount={p.amount}
										creatorName="you"
										inviteCode={props.inviteCode}
									/>
								) : null}
							</div>
						}
					/>
				))}
			</div>
		</section>
	)
}

function Row({ p, actions }: { p: AdminPayment; actions: React.ReactNode }) {
	return (
		<div className="mb-1 grid grid-cols-[28px_1fr_120px_60px_auto] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
			<Avatar name={p.userName} />
			<div>
				<div className="text-sm font-semibold">
					{p.userName}
					{p.isRebuy ? ' (rebuy)' : ''}
				</div>
				<div className="text-[10px] text-muted-foreground">{rowSubtitle(p)}</div>
			</div>
			<PaymentStatusChip status={p.status} />
			<div className="text-sm font-semibold">£{p.amount}</div>
			<div className="flex justify-end gap-1">{actions}</div>
		</div>
	)
}

function Avatar({ name }: { name: string }) {
	const initials = name
		.split(' ')
		.slice(0, 2)
		.map((s) => s.charAt(0).toUpperCase())
		.join('')
	return (
		<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground/80">
			{initials || '?'}
		</span>
	)
}

function rowSubtitle(p: AdminPayment): string {
	if (p.status === 'paid') {
		return p.paidAt ? `Confirmed ${formatDate(p.paidAt)}` : 'Confirmed'
	}
	if (p.status === 'claimed') {
		return p.claimedAt ? `Marked paid ${formatDate(p.claimedAt)}` : 'Marked paid'
	}
	if (p.status === 'refunded') {
		return 'Refunded'
	}
	return 'Not yet paid'
}

function formatDate(d: Date): string {
	return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
