'use client'

import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PaymentReminderButton } from './payment-reminder'
import { type PaymentStatus, PaymentStatusChip } from './payment-status-chip'

export interface AdminPayment {
	userId: string
	userName: string
	amount: string
	status: PaymentStatus
	isRebuy: boolean
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
	const claimed = props.payments.filter((p) => p.status === 'claimed')
	const all = props.payments
	const unpaidCount = all.filter((p) => p.status === 'pending').length

	async function callAction(userId: string, action: 'confirm' | 'reject' | 'revert') {
		const endpoint = action === 'confirm' ? 'confirm' : action === 'reject' ? 'reject' : 'override'
		const body = action === 'revert' ? JSON.stringify({ status: 'pending' }) : undefined
		const res = await fetch(`/api/games/${props.gameId}/payments/${userId}/${endpoint}`, {
			method: 'POST',
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body,
		})
		if (res.ok) {
			toast.success(
				action === 'confirm'
					? 'Payment confirmed'
					: action === 'reject'
						? 'Payment rejected'
						: 'Payment reverted',
			)
			props.onChange?.()
		} else {
			toast.error(`Failed to ${action}`)
		}
	}

	return (
		<section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
			<div className="flex items-start justify-between">
				<div>
					<h2 className="font-display text-lg font-semibold">Payments</h2>
					<div className="text-[11px] text-muted-foreground">
						{claimed.length} of {all.length} awaiting confirmation · {unpaidCount} unpaid
					</div>
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

			{claimed.length > 0 && (
				<div>
					<div className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
						Needs your attention ({claimed.length})
					</div>
					{claimed.map((p) => (
						<Row
							key={`${p.userId}-claimed`}
							p={p}
							highlight
							actions={
								<>
									<button
										type="button"
										onClick={() => callAction(p.userId, 'confirm')}
										className="rounded bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
									>
										✓ Confirm
									</button>
									<button
										type="button"
										onClick={() => callAction(p.userId, 'reject')}
										className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700"
									>
										Reject
									</button>
								</>
							}
						/>
					))}
				</div>
			)}

			<div>
				<div className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
					All payments
				</div>
				{all.map((p) => (
					<Row
						key={`${p.userId}-all-${p.isRebuy ? 'rebuy' : 'original'}`}
						p={p}
						actions={
							p.status === 'paid' ? (
								<button
									type="button"
									onClick={() => callAction(p.userId, 'revert')}
									className="rounded border border-border px-3 py-1.5 text-xs font-semibold"
								>
									Revert
								</button>
							) : p.status === 'pending' ? (
								<PaymentReminderButton
									gameName={props.gameName}
									amount={p.amount}
									creatorName="you"
									inviteCode={props.inviteCode}
								/>
							) : null
						}
					/>
				))}
			</div>
		</section>
	)
}

function Row({
	p,
	actions,
	highlight,
}: {
	p: AdminPayment
	actions: React.ReactNode
	highlight?: boolean
}) {
	return (
		<div
			className={cn(
				'mb-1 grid grid-cols-[28px_1fr_120px_60px_auto] items-center gap-2 rounded-lg border px-3 py-2',
				highlight ? 'border-amber-300 bg-amber-50' : 'border-border bg-card',
			)}
		>
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
