'use client'

import { useState } from 'react'
import { PayMeEditor, type SavedPaymentHandle } from '@/components/game/pay-me-editor'
import { Disclosure } from '@/components/ui/disclosure'
import type { PaymentProvider } from '@/lib/payments/payment-link'

/**
 * The summary page's Settings fold — the payment handle's permanent home.
 *
 * The handle belongs to the player, not to a game, but until now it could only
 * be reached from game creation and game administration: someone who had only
 * ever *joined* games had nowhere to set it, and found that out the first time
 * they ran one. This is that nowhere fixed.
 *
 * Collapsed by default, because a settings fold is not what anybody opens their
 * own summary to read. The control inside it is the same `PayMeEditor` the
 * admin Payments panel renders, saving through the same owner-only endpoint —
 * this is a second door onto one setting, not a second way of writing it.
 *
 * The saved value is held here so the line above the button reflects a save
 * without a round-trip: the page behind it is a server component with no client
 * state of its own, and re-fetching a whole summary to re-print one handle
 * would be a lot of page for one line.
 */
export function SettingsFold({
	paymentProvider,
	paymentHandle,
	defaultOpen = false,
}: {
	paymentProvider: PaymentProvider | null
	paymentHandle: string | null
	/** Only the gallery opens it on render; the page always starts folded. */
	defaultOpen?: boolean
}) {
	const [saved, setSaved] = useState<SavedPaymentHandle>({
		provider: paymentProvider,
		handle: paymentHandle,
	})

	return (
		<Disclosure
			title="Settings"
			subtitle="Where players pay you"
			defaultOpen={defaultOpen}
			className="mt-6"
		>
			<div className="space-y-2 p-4">
				<p className="text-xs text-muted-foreground">
					Set this once and every game you run points players at it. You don&apos;t need a game to
					change it, and clearing it puts you back to collecting payments yourself.
				</p>
				<PayMeEditor
					provider={saved.provider}
					handle={saved.handle}
					idPrefix="settings-pay"
					onChange={setSaved}
				/>
			</div>
		</Disclosure>
	)
}
