'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { DiscoverGameCard } from '@/components/game/discover-game-card'
import type { DiscoverGameView } from '@/lib/game/discover-view'
import { cn } from '@/lib/utils'

/**
 * Public games that have already started and so can't be joined — collapsed by
 * default behind a count and a show/hide control, the same shape past games take.
 *
 * Not a call to action: these are here so you can see a game is running and know
 * to ask its admin for an in. Tapping one leads to the game page's non-member
 * view, which says exactly that.
 *
 * Renders nothing when there are none — no empty header.
 */
export function InProgressGamesSection({ games }: { games: DiscoverGameView[] }) {
	const [open, setOpen] = useState(false)
	if (games.length === 0) return null

	return (
		<section className="mt-8">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between py-2 text-left group"
			>
				<span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
					In progress · {games.length}
				</span>
				<span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
					{open ? 'Hide' : 'Show'}
					<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
				</span>
			</button>
			{open && (
				<>
					<p className="text-xs text-muted-foreground">
						Already under way, so joining yourself has closed. The game&apos;s admin can still add
						you.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
						{games.map((g) => (
							<DiscoverGameCard key={g.id} game={g} state="in-progress" />
						))}
					</div>
				</>
			)}
		</section>
	)
}
