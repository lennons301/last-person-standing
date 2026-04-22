'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { GameCard } from '@/components/game/game-card'
import type { DashboardGame } from '@/lib/game/queries'
import { cn } from '@/lib/utils'

interface PastGamesSectionProps {
	games: DashboardGame[]
}

export function PastGamesSection({ games }: PastGamesSectionProps) {
	const [open, setOpen] = useState(false)
	if (games.length === 0) return null

	return (
		<div className="mt-8">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between py-2 text-left group"
			>
				<span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
					Past games · {games.length}
				</span>
				<span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
					{open ? 'Hide' : 'Show'}
					<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
				</span>
			</button>
			{open && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
					{games.map((g) => (
						<GameCard key={g.id} game={g} />
					))}
				</div>
			)}
		</div>
	)
}
