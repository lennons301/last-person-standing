import { cn } from '@/lib/utils'

export type PaymentStatus = 'pending' | 'claimed' | 'paid' | 'refunded'
export type AdminPaymentStatus = PaymentStatus | 'unpaid'

const STYLES: Record<AdminPaymentStatus, string> = {
	unpaid: 'bg-slate-100 text-slate-500',
	pending: 'bg-muted text-foreground/70',
	claimed: 'bg-amber-100 text-amber-900',
	paid: 'bg-emerald-100 text-emerald-900',
	refunded: 'bg-muted text-foreground/70',
}

const LABELS: Record<AdminPaymentStatus, string> = {
	unpaid: 'UNPAID',
	pending: 'UNPAID',
	claimed: '⏱ AWAITING CONFIRMATION',
	paid: '✓ PAID',
	refunded: 'REFUNDED',
}

export function PaymentStatusChip({
	status,
	className,
}: {
	status: AdminPaymentStatus
	className?: string
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
				STYLES[status],
				className,
			)}
		>
			{LABELS[status]}
		</span>
	)
}
