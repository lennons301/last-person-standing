'use client'

import { AdminPanel } from '@/components/game/admin-panel'
import { type AdminPayment, PaymentsPanel } from '@/components/game/payments-panel'
import { Disclosure } from '@/components/ui/disclosure'
import type { PaymentProvider } from '@/lib/payments/payment-link'

interface ManageGameFoldProps {
	gameId: string
	gameName: string
	inviteCode: string
	entryFee: string | null
	gameStatus: string
	aliveCount: number
	pot: { confirmed: string; pending: string; total: string }
	payments: AdminPayment[] | undefined
	/** The admin's own saved pay-me handle, editable from the Payments panel. */
	paymentProvider?: PaymentProvider | null
	paymentHandle?: string | null
	onChange?: () => void
}

/**
 * Admin-only management fold at the bottom of the game page. Collapsed by
 * default so an admin who is *playing* sees the same clean page as everyone
 * else; the admin + payment tooling only appears when they deliberately open
 * it. Render this solely for admins — there is no non-admin variant.
 */
export function ManageGameFold({
	gameId,
	gameName,
	inviteCode,
	entryFee,
	gameStatus,
	aliveCount,
	pot,
	payments,
	paymentProvider = null,
	paymentHandle = null,
	onChange,
}: ManageGameFoldProps) {
	return (
		<Disclosure
			title="Manage game"
			subtitle="Players, payments and pot"
			defaultOpen={false}
			className="mt-6"
			rightSlot={
				<span className="rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
					Admin
				</span>
			}
		>
			<div className="space-y-4 p-4">
				<AdminPanel
					gameId={gameId}
					gameName={gameName}
					aliveCount={aliveCount}
					potTotal={pot.total}
				/>
				{payments && payments.length > 0 && (
					<PaymentsPanel
						gameId={gameId}
						gameName={gameName}
						inviteCode={inviteCode}
						entryFee={entryFee}
						gameStatus={gameStatus}
						totals={pot}
						payments={payments}
						paymentProvider={paymentProvider}
						paymentHandle={paymentHandle}
						onChange={onChange}
					/>
				)}
			</div>
		</Disclosure>
	)
}
