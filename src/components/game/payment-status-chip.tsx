import { cn } from '@/lib/utils'

export type PaymentStatus = 'pending' | 'claimed' | 'paid' | 'refunded'

const STYLES: Record<PaymentStatus, string> = {
	pending: 'bg-muted text-foreground/70',
	claimed: 'bg-amber-100 text-amber-900',
	paid: 'bg-emerald-100 text-emerald-900',
	refunded: 'bg-muted text-foreground/70',
}

const LABELS: Record<PaymentStatus, string> = {
	pending: 'UNPAID',
	claimed: '⏱ AWAITING CONFIRMATION',
	paid: '✓ PAID',
	refunded: 'REFUNDED',
}

export function PaymentStatusChip({
	status,
	className,
}: {
	status: PaymentStatus
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
