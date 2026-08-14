import { DiscoverGameCard } from '@/components/game/discover-game-card'
import type { DiscoverGameView } from '@/lib/game/discover-view'

/**
 * Public games open for entry that the viewer isn't in — the prominent half of
 * discovery, and for a brand-new player the whole home page.
 *
 * Renders nothing at all when there are none: a heading over an empty list would
 * announce a shortage nobody asked about.
 */
export function OpenGamesSection({ games }: { games: DiscoverGameView[] }) {
	if (games.length === 0) return null

	return (
		<section className="mt-8">
			<h2 className="font-display text-lg font-semibold">Open to join</h2>
			<p className="text-sm text-muted-foreground mt-0.5">
				{games.length === 1 ? 'One game is' : `${games.length} games are`} taking players. Soonest
				to start first.
			</p>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
				{games.map((g) => (
					<DiscoverGameCard key={g.id} game={g} state="open" />
				))}
			</div>
		</section>
	)
}
