'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PaymentReminderButton } from './payment-reminder'
import { type AdminPaymentStatus, PaymentStatusChip } from './payment-status-chip'

export interface AdminPayment {
	id: string | null
	userId: string
	userName: string
	amount: string
	status: AdminPaymentStatus
	isRebuy: boolean
	isRebuyEligible: boolean
	claimedAt: Date | null
	paidAt: Date | null
}

interface PaymentsPanelProps {
	gameId: string
	gameName: string
	inviteCode: string
	entryFee: string | null
	/** Game lifecycle status — the entry fee can't be edited once 'completed'. */
	gameStatus: string
	totals: { confirmed: string; pending: string; total: string }
	payments: AdminPayment[]
	onChange?: () => void
}

export function PaymentsPanel(props: PaymentsPanelProps) {
	const all = props.payments
	const unpaidCount = all.filter((p) => p.status === 'pending' || p.status === 'unpaid').length

	async function callAction(
		p: AdminPayment,
		action: 'dispute' | 'admin-rebuy' | 'mark-paid' | 'add-rebuy' | 'mark-entry-paid',
	) {
		if (action === 'mark-entry-paid') {
			// A late-added player has no payment row at all (synthetic "unpaid"
			// row, id === null) so the id-based override can't reach them. Create a
			// paid entry directly — same effect on the pot as confirming any entry.
			const res = await fetch(`/api/games/${props.gameId}/admin/mark-entry-paid/${p.userId}`, {
				method: 'POST',
			})
			if (res.ok) {
				toast.success(`Marked ${p.userName} as paid`)
				props.onChange?.()
			} else {
				const body = await res.json().catch(() => ({ error: 'failed' }))
				toast.error(
					body.error === 'entry-exists'
						? `${p.userName} already has an entry`
						: 'Failed to mark paid',
				)
			}
			return
		}
		if (action === 'add-rebuy') {
			// Record a rebuy (extra entry) at any stage — even after the rebuy
			// window. Creates a pending entry; mark it paid (here or by the player)
			// to grow the pot.
			const res = await fetch(`/api/games/${props.gameId}/admin/add-rebuy/${p.userId}`, {
				method: 'POST',
			})
			if (res.ok) {
				toast.success(`Rebuy added for ${p.userName} — mark it paid to grow the pot`)
				props.onChange?.()
			} else {
				const body = await res.json().catch(() => ({ error: 'failed' }))
				toast.error(
					body.error === 'pending-entry-exists'
						? `${p.userName} already has an unpaid entry`
						: 'Failed to add rebuy',
				)
			}
			return
		}
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
		if (action === 'mark-paid') {
			// Admin confirms the entry fee was paid (e.g. cash). Uses the existing
			// payment override endpoint, which sets status=paid + paidAt.
			if (!p.id) return
			const res = await fetch(`/api/games/${props.gameId}/payments/${p.id}/override`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'paid' }),
			})
			if (res.ok) {
				toast.success(`Marked ${p.userName} as paid`)
				props.onChange?.()
			} else {
				toast.error('Failed to mark paid')
			}
			return
		}
		// 'dispute' branch — POSTs to .../{paymentId}/reject
		if (!p.id) return
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

			<EntryFeeEditor
				gameId={props.gameId}
				entryFee={props.entryFee}
				editable={props.gameStatus !== 'completed'}
				onChange={props.onChange}
			/>

			<div className="overflow-x-auto">
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
										className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									>
										Rebuy player
									</button>
								)}
								{p.id !== null && p.status === 'paid' ? (
									<>
										{!p.isRebuy && (
											<button
												type="button"
												onClick={() => callAction(p, 'add-rebuy')}
												className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
											>
												Add rebuy
											</button>
										)}
										<button
											type="button"
											onClick={() => callAction(p, 'dispute')}
											className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
										>
											Dispute
										</button>
									</>
								) : p.id !== null && (p.status === 'pending' || p.status === 'claimed') ? (
									<>
										<button
											type="button"
											onClick={() => callAction(p, 'mark-paid')}
											className="rounded border border-[var(--alive)] px-3 py-1.5 text-xs font-semibold text-[var(--alive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
										>
											Mark paid
										</button>
										{p.status === 'pending' && (
											<PaymentReminderButton
												gameName={props.gameName}
												amount={p.amount}
												creatorName="you"
												inviteCode={props.inviteCode}
											/>
										)}
									</>
								) : p.id === null && p.status === 'unpaid' ? (
									// Late-added player with no payment row — let the admin record
									// the entry fee as paid (mirrors pre-deadline entrants' Mark paid).
									<button
										type="button"
										onClick={() => callAction(p, 'mark-entry-paid')}
										className="rounded border border-[var(--alive)] px-3 py-1.5 text-xs font-semibold text-[var(--alive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									>
										Mark paid
									</button>
								) : null}
							</div>
						}
					/>
				))}
			</div>
		</section>
	)
}

/**
 * Edit the per-player entry fee mid-game. Saving updates `game.entryFee` AND
 * bumps every existing non-refunded payment to the new fee, so the pot resizes
 * to match (the pot is derived from paid amounts). Hidden as read-only once the
 * game is completed.
 */
function EntryFeeEditor({
	gameId,
	entryFee,
	editable,
	onChange,
}: {
	gameId: string
	entryFee: string | null
	editable: boolean
	onChange?: () => void
}) {
	const current = entryFee ?? '0.00'
	const [editing, setEditing] = useState(false)
	const [value, setValue] = useState(current)
	const [saving, setSaving] = useState(false)

	async function save() {
		const num = Number.parseFloat(value)
		if (!Number.isFinite(num) || num < 0) {
			toast.error('Enter a valid amount')
			return
		}
		setSaving(true)
		const res = await fetch(`/api/games/${gameId}/admin/entry-fee`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ entryFee: value }),
		})
		setSaving(false)
		if (res.ok) {
			toast.success(`Entry fee set to £${num.toFixed(2)} — existing entries updated`)
			setEditing(false)
			onChange?.()
		} else {
			const body = await res.json().catch(() => ({ error: 'failed' }))
			toast.error(
				body.error === 'game-completed'
					? "Can't change the fee on a finished game"
					: 'Failed to update entry fee',
			)
		}
	}

	return (
		<div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
			<div className="text-xs text-muted-foreground">
				Entry fee <span className="font-semibold text-foreground">£{current}</span>
				<span className="ml-1">per player</span>
			</div>
			{editable &&
				(editing ? (
					<div className="flex items-center gap-1">
						<span className="text-xs text-muted-foreground">£</span>
						<input
							type="number"
							min="0"
							step="0.01"
							inputMode="decimal"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							aria-label="New entry fee"
							className="w-20 rounded border border-border px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						/>
						<button
							type="button"
							onClick={save}
							disabled={saving}
							className="rounded border border-[var(--alive)] px-3 py-1.5 text-xs font-semibold text-[var(--alive)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							Save
						</button>
						<button
							type="button"
							onClick={() => {
								setEditing(false)
								setValue(current)
							}}
							className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							Cancel
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						Edit
					</button>
				))}
		</div>
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
	// Admin-facing payment confirmations. Pinned to Europe/London for stability;
	// admins are UK-based and the day/month label doesn't shift across most TZs.
	return d.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'Europe/London',
	})
}
