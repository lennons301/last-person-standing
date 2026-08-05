'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PaymentProvider } from '@/lib/payments/payment-link'

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
	monzo: 'Monzo',
	revolut: 'Revolut',
}

/**
 * "Where do players pay you?" — the creator's Monzo/Revolut username.
 *
 * Controlled and stateless so both places that capture it (the create-game form
 * and the admin Payments panel) share one control. Leaving it blank is a
 * first-class choice: no handle means players see today's "admin will collect
 * payment separately" line, and nothing else changes.
 */
export function PaymentHandleField({
	provider,
	handle,
	onProviderChange,
	onHandleChange,
	idPrefix = 'pay',
}: {
	provider: PaymentProvider | null
	handle: string
	onProviderChange: (provider: PaymentProvider | null) => void
	onHandleChange: (handle: string) => void
	/** Distinguishes the radio group when two of these render on one page. */
	idPrefix?: string
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={`${idPrefix}-handle`}>Where do players pay you?</Label>
			<div className="flex items-center gap-4">
				{(Object.keys(PROVIDER_LABELS) as PaymentProvider[]).map((p) => (
					<label key={p} className="flex items-center gap-1.5 text-sm" htmlFor={`${idPrefix}-${p}`}>
						<input
							id={`${idPrefix}-${p}`}
							type="radio"
							name={`${idPrefix}-provider`}
							value={p}
							checked={provider === p}
							onChange={() => onProviderChange(p)}
						/>
						<span>{PROVIDER_LABELS[p]}</span>
					</label>
				))}
			</div>
			<Input
				id={`${idPrefix}-handle`}
				value={handle}
				onChange={(e) => onHandleChange(e.target.value)}
				placeholder="alicejones"
				aria-label={`${provider === 'revolut' ? 'Revolut' : 'Monzo'} username`}
				autoComplete="off"
			/>
			<p className="text-xs text-muted-foreground">
				Optional. Just your username — we'll build a <code>{provider ?? 'monzo'}.me</code> link with
				the amount filled in, so players can pay by card. We never handle the money.
			</p>
		</div>
	)
}
