'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'

interface SplitPotModalProps {
	gameId: string
	aliveCount: number
	potTotal: string
	open: boolean
	onClose: () => void
}

export function SplitPotModal({ gameId, aliveCount, potTotal, open, onClose }: SplitPotModalProps) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const totalNum = Number(potTotal)
	const perWinner = aliveCount > 0 ? (totalNum / aliveCount).toFixed(2) : '0.00'

	async function handleConfirm() {
		if (submitting) return
		setSubmitting(true)
		setError(null)
		try {
			const res = await fetch(`/api/games/${gameId}/admin/split-pot`, {
				method: 'POST',
			})
			const body = await res.json()
			if (!res.ok) {
				setError(body.error ?? 'failed')
				return
			}
			onClose()
			router.refresh()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Split the pot now?</DialogTitle>
					<DialogDescription>
						This ends the game immediately. All {aliveCount} alive players are marked as winners.
						Eliminated players get nothing.
					</DialogDescription>
				</DialogHeader>
				<div className="rounded-md border border-border bg-card p-3 text-center">
					<div className="text-xl font-extrabold tabular-nums text-emerald-500">
						£{perWinner} each
					</div>
					<div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						£{potTotal} split {aliveCount} ways
					</div>
				</div>
				<p className="rounded-r-sm border-l-2 border-amber-500 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-500">
					⚠ This can't be undone. Game status becomes "completed".
				</p>
				{error && <p className="text-xs text-red-500">Couldn't split: {error}</p>}
				<DialogFooter>
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={submitting || aliveCount < 2}
						className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
					>
						Split £{potTotal} across {aliveCount} winners
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
