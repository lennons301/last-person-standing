import { type PaymentStatus, PaymentStatusChip } from './payment-status-chip'

interface OtherPayment {
	userName: string
	status: PaymentStatus
	isRebuy: boolean
}

export function OtherPlayersPayments({ payments }: { payments: OtherPayment[] }) {
	return (
		<div className="space-y-1">
			<div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				Other players
			</div>
			{payments.map((p) => (
				<div
					key={`${p.userName}-${p.isRebuy ? 'rebuy' : 'original'}`}
					className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-[12px]"
				>
					<span>
						{p.userName}
						{p.isRebuy ? ' (rebuy)' : ''}
					</span>
					<PaymentStatusChip status={p.status} />
				</div>
			))}
		</div>
	)
}
