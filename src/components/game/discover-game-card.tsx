import Link from 'next/link'
import { LocalDateTime } from '@/components/local-datetime'
import { Card } from '@/components/ui/card'
import type { DiscoverGameView } from '@/lib/game/discover-view'

/**
 * A game the viewer is **not** in — the home page's discovery sections.
 *
 * `GameCard` can't do this job: it's built around your own membership (your
 * status, whether you've picked, alive and unpaid counts), none of which exists
 * for a game you're not a player in. What's left is what somebody choosing
 * between games reads: the name, the mode and competition, how full it is, what
 * it costs, and when it starts.
 *
 * No pot and no creator name, deliberately — see `buildDiscoverView`.
 */
interface DiscoverGameCardProps {
	game: DiscoverGameView
	/**
	 * `open` — the game can be joined: the card links into the join flow and its
	 * time reads as a start still to come.
	 *
	 * `in-progress` — it can't: the card links to the game page, whose non-member
	 * view says the game has started and that the admin can add you.
	 */
	state: 'open' | 'in-progress'
}

export function DiscoverGameCard({ game, state }: DiscoverGameCardProps) {
	const open = state === 'open'
	const href = open ? `/join/${game.inviteCode}` : `/game/${game.id}`

	return (
		<Link href={href}>
			<Card
				className={`p-5 hover:shadow-md transition-shadow cursor-pointer h-full ${
					open ? '' : 'opacity-60'
				}`}
			>
				<h2 className="font-display font-semibold text-lg mb-2">{game.name}</h2>

				<div className="flex gap-x-4 gap-y-1 text-sm text-muted-foreground flex-wrap">
					<span>
						{game.modeLabel} · {game.competition}
					</span>
					<span>{game.playersLabel}</span>
					<span className="font-display font-semibold text-foreground">{game.entryLabel}</span>
				</div>

				<div className="pt-3 mt-3 border-t text-xs text-muted-foreground flex flex-wrap gap-x-2">
					<span>
						{open ? 'Starts' : 'Started'}
						{game.startRoundLabel ? ` · ${game.startRoundLabel}` : ''}
					</span>
					{game.startsAt ? (
						<LocalDateTime date={game.startsAt} className="font-medium text-foreground" />
					) : (
						<span className="font-medium text-foreground">Date to be confirmed</span>
					)}
				</div>
			</Card>
		</Link>
	)
}
