'use client'

import { ChevronDown, RotateCcw } from 'lucide-react'
import { useId, useState } from 'react'
import type { GameViewStats } from '@/lib/game/game-view'
import { cn } from '@/lib/utils'

/**
 * The page's compact stat line: the pot and how many players are still in.
 * Sits directly under the identity bar and owns those numbers for the whole
 * page — the standings sections and the (retired) header card no longer print a
 * pot figure of their own.
 *
 * The pot is a disclosure rather than four standing figures: confirmed,
 * pending, unpaid and target are one tap away for the player who cares, and out
 * of the way of the one who doesn't. `unpaidNotice` is the slot the viewer's own
 * "settle up" prompt renders into, so an outstanding balance reads as a quiet
 * aside on this line instead of a full-width band.
 *
 * `refunded` is the one figure that isn't part of the pot's arithmetic — money
 * handed back to admin-removed players, which `calculatePot` reports without
 * banking it into `total`. It rides in as its own prop rather than on `stats`
 * because it comes straight off the `PotBreakdown`, and it renders last, below
 * the four rows that do add up, and only when there is some: most games never
 * refund anything.
 */
export function GameStatLine({
	stats,
	refunded,
	unpaidNotice,
	className,
}: {
	stats: GameViewStats
	refunded?: string
	unpaidNotice?: React.ReactNode
	className?: string
}) {
	const [open, setOpen] = useState(false)
	const panelId = useId()

	return (
		<div className={cn('text-xs text-muted-foreground', className)}>
			<div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					aria-controls={panelId}
					aria-label={`£${stats.potConfirmed} pot — ${open ? 'hide' : 'show'} breakdown`}
					className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<span className="font-semibold text-foreground">£{stats.potConfirmed}</span> pot
					<ChevronDown
						aria-hidden
						className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
					/>
				</button>

				<span aria-hidden>·</span>

				<span>
					<span className="font-semibold text-foreground">{stats.aliveCount}</span> of{' '}
					{stats.playerCount} in
				</span>

				{stats.rebuyAvailable && (
					<>
						<span aria-hidden>·</span>
						<span className="inline-flex items-center gap-1 text-[var(--draw)]">
							<RotateCcw aria-hidden className="h-3.5 w-3.5" />
							Rebuy available
						</span>
					</>
				)}

				{unpaidNotice}
			</div>

			{open && (
				<dl
					id={panelId}
					className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 max-w-xs rounded-md border border-border bg-muted/30 px-3 py-2"
				>
					<PotRow label="Confirmed" amount={stats.potConfirmed} />
					<PotRow label="Pending" amount={stats.potPending} />
					<PotRow label="Unpaid" amount={stats.potUnpaid} />
					<PotRow label="Target" amount={stats.potTarget} />
					{refunded && refunded !== '0.00' && (
						<PotRow label="Refunded to players" amount={refunded} />
					)}
				</dl>
			)}
		</div>
	)
}

function PotRow({ label, amount }: { label: string; amount: string }) {
	return (
		<div className="contents">
			<dt>{label}</dt>
			<dd className="text-right font-medium text-foreground tabular-nums">£{amount}</dd>
		</div>
	)
}
