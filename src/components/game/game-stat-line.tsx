import { Coins, RotateCcw, Users } from 'lucide-react'
import type { GameViewStats } from '@/lib/game/game-view'
import { cn } from '@/lib/utils'

/**
 * Compact pot + players line under the hero. Owns those numbers whenever a hero
 * renders (`demote.headerStats`), so the header's big pot block stands down and
 * each figure has exactly one home on the page.
 */
export function GameStatLine({ stats, className }: { stats: GameViewStats; className?: string }) {
	return (
		<div
			className={cn(
				'flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground',
				className,
			)}
		>
			<span className="flex items-center gap-1.5">
				<Coins className="h-3.5 w-3.5" />
				<span className="font-semibold text-foreground">£{stats.potConfirmed}</span> pot
				{stats.potTotal !== stats.potConfirmed && <span>(£{stats.potTotal} incl. pending)</span>}
			</span>
			<span className="flex items-center gap-1.5">
				<Users className="h-3.5 w-3.5" />
				<span className="font-semibold text-foreground">{stats.aliveCount}</span> alive of{' '}
				{stats.playerCount}
			</span>
			{stats.rebuyAvailable && (
				<span className="flex items-center gap-1.5 text-[var(--draw)]">
					<RotateCcw className="h-3.5 w-3.5" />
					Rebuy available
				</span>
			)}
		</div>
	)
}
