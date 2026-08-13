'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { PaymentProvider } from '@/lib/payments/payment-link'
import { PaymentHandleField } from './payment-handle-field'

export interface SavedPaymentHandle {
	provider: PaymentProvider | null
	handle: string | null
}

/**
 * Where players are pointed to pay — the viewer's own Monzo/Revolut handle,
 * shown as a line of prose with an Edit button behind it.
 *
 * Saves through the owner-only endpoint, which keys off the session alone, so
 * this can only ever change the viewer's own handle. Changing it re-points
 * future links; payments already settled are history and stay untouched.
 *
 * Lives outside any one surface because the handle belongs to the player, not
 * to a game: the admin Payments panel and the summary page's Settings fold both
 * render this, so there is exactly one control and one write path for it.
 */
export function PayMeEditor({
	provider,
	handle,
	idPrefix = 'admin-pay',
	onChange,
}: {
	provider: PaymentProvider | null
	handle: string | null
	/** Distinguishes the radio group when two of these render on one page. */
	idPrefix?: string
	onChange?: (saved: SavedPaymentHandle) => void
}) {
	const [editing, setEditing] = useState(false)
	const [draftProvider, setDraftProvider] = useState<PaymentProvider | null>(provider)
	const [draftHandle, setDraftHandle] = useState(handle ?? '')
	const [saving, setSaving] = useState(false)

	async function save() {
		setSaving(true)
		// Emptying the username is how you remove the link, so a leftover provider
		// selection doesn't count as half a handle.
		const res = await fetch('/api/me/payment-handle', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				provider: draftHandle.trim() ? draftProvider : null,
				handle: draftHandle,
			}),
		})
		setSaving(false)
		if (res.ok) {
			const saved = (await res.json()) as SavedPaymentHandle
			toast.success(
				saved.handle
					? `Players will be sent to ${saved.provider}.me/${saved.handle}`
					: "Payment link removed — you'll collect payments yourself",
			)
			setEditing(false)
			onChange?.(saved)
		} else {
			toast.error('Enter just your username, e.g. alicejones')
		}
	}

	if (editing) {
		return (
			<div className="space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
				<PaymentHandleField
					provider={draftProvider}
					handle={draftHandle}
					onProviderChange={setDraftProvider}
					onHandleChange={setDraftHandle}
					idPrefix={idPrefix}
				/>
				<div className="flex gap-1">
					<button
						type="button"
						onClick={save}
						disabled={saving}
						className="rounded border border-[var(--alive)] px-3 py-1.5 text-xs font-semibold text-[var(--alive)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						Save payment link
					</button>
					<button
						type="button"
						onClick={() => {
							setEditing(false)
							setDraftProvider(provider)
							setDraftHandle(handle ?? '')
						}}
						className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						Cancel
					</button>
				</div>
			</div>
		)
	}

	return (
		<div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
			<div className="text-xs text-muted-foreground">
				{provider && handle ? (
					<>
						Players pay{' '}
						<span className="font-semibold text-foreground">
							{provider}.me/{handle}
						</span>
					</>
				) : (
					<>No payment link — players are told you'll collect payment separately</>
				)}
			</div>
			<button
				type="button"
				onClick={() => setEditing(true)}
				className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				Edit payment link
			</button>
		</div>
	)
}
