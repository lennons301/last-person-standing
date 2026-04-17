'use client'

import { Button } from '@/components/ui/button'

interface PickConfirmBarProps {
	message: string
	actionLabel: string
	onConfirm: () => void
	disabled?: boolean
	loading?: boolean
}

export function PickConfirmBar({
	message,
	actionLabel,
	onConfirm,
	disabled,
	loading,
}: PickConfirmBarProps) {
	return (
		<div className="sticky bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 py-3 flex justify-between items-center gap-3">
			<span className="text-sm truncate">{message}</span>
			<Button
				onClick={onConfirm}
				disabled={disabled || loading}
				className="bg-[var(--alive)] hover:bg-[var(--alive)]/90 text-white shrink-0"
			>
				{loading ? 'Locking...' : actionLabel}
			</Button>
		</div>
	)
}
